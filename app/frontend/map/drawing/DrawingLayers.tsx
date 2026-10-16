import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { t } from '@/lib/i18n'
import { LayersControl } from '@/map/editor/controls'
import { useEditor } from '@/map/editor/EditorContext'
import { hiddenPlantIds } from '@/map/drawing/hidden'
import { drawingStore, initDrawingState, useDrawingState } from '@/map/drawing/store'
import { applyLayerVisibility, installDrawingLayers } from '@/map/drawing/style'
import { FEATURES_SOURCE } from '@/map/layers/features'
import { usePhotos } from '@/map/photos/store'
import { usePlanting } from '@/map/plants/store'
import { plantStrata } from '@/map/plants/strata'
import type { MapFeature } from '@/types'
import { initScenario, scenarioStore, useScenario } from '@/map/scenario'

/**
 * Overlay without UI: styles the library elements on the editor map, keeps
 * the "Calques" visibility (layers, kinds, plant strata) and the current / projected scenario applied to
 * and the version shown (a tag) to every feature layer (including ones other modules add later) and hides a feature while its shape is edited.
 */
export default function DrawingLayers() {
  const editor = useEditor()
  const map = editor.instance
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const editingId = useDrawingState((s) => s.shapeEditId)
  const scenario = useScenario()
  const version = useDrawingState((s) => s.version)
  const hiddenKinds = useDrawingState((s) => s.hiddenKinds)
  const hiddenStrata = useDrawingState((s) => s.hiddenStrata)
  const { data: planting } = usePlanting(editor.map.id)
  const hiddenIds = useMemo(
    // Until the planting data is there, no strata is known: hide nothing rather than every plant.
    () => (planting ? hiddenPlantIds(editor.features, hiddenStrata, (f) => plantStrata(f as MapFeature, planting)) : []),
    [editor.features, hiddenStrata, planting],
  )
  const options = { scenario, version, hiddenKinds, hiddenIds }
  const latest = useRef(options)
  latest.current = options

  useLayoutEffect(() => {
    initDrawingState(editor.map.id)
    initScenario(editor.map.id)
  }, [editor.map.id])

  useEffect(() => {
    // The generic feature layers are installed by the editor after its
    // children mount: wait for them, then follow any later style change.
    const ensure = () => {
      if (installDrawingLayers(map)) applyLayerVisibility(map, drawingStore.get().hiddenLayers, { ...latest.current, scenario: scenarioStore.get() })
    }
    ensure()
    map.on('styledata', ensure)
    return () => {
      map.off('styledata', ensure)
    }
  }, [map])

  useEffect(() => applyLayerVisibility(map, hidden, { scenario, version, hiddenKinds, hiddenIds }), [map, hidden, scenario, version, hiddenKinds, hiddenIds])

  // « Calques » from the map, in the column of map controls; the photos button joins it below.
  const openPanel = useRef(editor.openPanel)
  openPanel.current = editor.openPanel
  const control = useRef<LayersControl | null>(null)
  useEffect(() => {
    const layersControl = new LayersControl(() => openPanel.current('drawing-layers'))
    map.addControl(layersControl, 'top-right')
    // At the bottom of the column, right above the photos button (added once the photos load),
    // once the editor placed its own controls.
    const place = window.setTimeout(() => {
      const element = map.getContainer().querySelector('.editor-layers-control')
      const photos = map.getContainer().querySelector('.editor-photos-toggle')
      if (!element?.parentElement) return
      if (photos?.parentElement === element.parentElement) element.parentElement.insertBefore(element, photos)
      else element.parentElement.appendChild(element)
    }, 0)
    control.current = layersControl
    return () => {
      window.clearTimeout(place)
      control.current = null
      map.removeControl(layersControl)
    }
  }, [map])
  const photosShown = usePhotos().showOnMap
  const somethingHidden = hidden.length > 0 || hiddenKinds.length > 0 || hiddenStrata.length > 0 || !photosShown
  useEffect(() => {
    control.current?.update(t(somethingHidden ? 'drawing.layers_panel.control_hidden' : 'drawing.layers_panel.control'), somethingHidden)
  }, [somethingHidden])

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
