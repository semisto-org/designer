import { useEffect, useLayoutEffect } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { drawingStore, initDrawingState, useDrawingState } from '@/map/drawing/store'
import { applyLayerVisibility, installDrawingLayers } from '@/map/drawing/style'
import { FEATURES_SOURCE } from '@/map/layers/features'

/**
 * Overlay without UI: styles the library elements on the editor map, keeps
 * the "Calques" visibility applied to every feature layer (including ones
 * other modules add later) and hides a feature while its shape is edited.
 */
export default function DrawingLayers() {
  const editor = useEditor()
  const map = editor.instance
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const editingId = useDrawingState((s) => s.shapeEditId)

  useLayoutEffect(() => initDrawingState(editor.map.id), [editor.map.id])

  useEffect(() => {
    // The generic feature layers are installed by the editor after its
    // children mount: wait for them, then follow any later style change.
    const ensure = () => {
      if (installDrawingLayers(map)) applyLayerVisibility(map, drawingStore.get().hiddenLayers)
    }
    ensure()
    map.on('styledata', ensure)
    return () => {
      map.off('styledata', ensure)
    }
  }, [map])

  useEffect(() => applyLayerVisibility(map, hidden), [map, hidden])

  useEffect(() => {
    if (editingId == null) return
    const target = { source: FEATURES_SOURCE, id: editingId }
    map.setFeatureState(target, { editing: true })
    return () => {
      if (map.getSource(FEATURES_SOURCE)) map.setFeatureState(target, { editing: false })
    }
  }, [map, editingId])

  return null
}
