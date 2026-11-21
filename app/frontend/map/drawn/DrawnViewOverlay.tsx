import { useEffect, useState } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { usePresentation } from '@/map/presentation/store'
import { applyDrawnView } from './apply'
import { loadContours, type Contours } from './contourLayer'
import { drawnViewOn } from './rules'
import { initDrawnView, useDrawnViewChoice } from './store'

/** Whether the editor shows the drawn view right now. */
export function useDrawnView(): boolean {
  const { mode, map, features } = useEditor()
  const presenting = usePresentation((s) => s.presenting)
  // Until this map's own choice is read, nothing: a viewer who turned the
  // paper off never sees it flash. An empty map has nothing to draw yet.
  const enabled = useDrawnViewChoice((s) => s.mapId === map.id && s.enabled)
  return features.length > 0 && drawnViewOn(mode, enabled, presenting)
}

/**
 * Always mounted in the editor. While one designs (« Projet »), the land
 * becomes a designer's base plan: paper over the photo at the share the
 * person chose, what is there in ink and grey washes, the project solid.
 * Applied again after any change of style or of an overlay's layers.
 */
export default function DrawnViewOverlay() {
  const editor = useEditor()
  useEffect(() => initDrawnView(editor.map.id), [editor.map.id])
  const on = useDrawnView()
  const photo = useDrawnViewChoice((s) => s.photo)
  // The contour lines of the map's own relief, once the drawn view is first shown.
  const [contours, setContours] = useState<Contours | null>(null)
  useEffect(() => {
    setContours(null)
    if (!on || !editor.entitlements.analyses) return
    let live = true
    void loadContours(editor.map.id).then((data) => { if (live) setContours(data) })
    return () => { live = false }
  }, [on, editor.map.id, editor.entitlements.analyses])

  useEffect(() => {
    const map = editor.instance
    const apply = () => {
      try {
        applyDrawnView(map, on, photo, contours)
        return true
      } catch {
        return false // style not ready yet: its `styledata` brings us back
      }
    }
    const listener = on ? apply : () => { if (apply()) map.off('styledata', listener) }
    if (apply() && !on) return
    map.on('styledata', listener)
    return () => {
      map.off('styledata', listener)
    }
  }, [editor.instance, on, photo, contours])

  return null
}
