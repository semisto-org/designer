import { area } from '@turf/turf'
import * as maplibregl from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { drawingStore, useDrawingState } from '@/map/drawing/store'
import { peekLabel } from '@/map/drawing/labelPeek'
import { useEditor } from '@/map/editor/EditorContext'
import { featureAt } from '@/map/featurePick'
import { plantLabelOf } from '@/map/plants/labelIndex'

/**
 * With « Noms sur la carte » off in « Calques », the names leave the map and
 * come back one at a time: the element under the mouse shows its own, in
 * the same dark pill, right under the cursor. Nothing on a touch screen (a
 * tap opens the element's card, which carries its name).
 */
export default function LabelPeek() {
  const editor = useEditor()
  const map = editor.instance
  const hidden = useDrawingState((s) => s.labelsHidden)
  const features = useRef(editor.features)
  features.current = editor.features

  useEffect(() => {
    // A touch screen has no hover: a tap opens the element's card instead.
    if (!hidden || !window.matchMedia?.('(hover: hover)').matches) return
    const element = document.createElement('div')
    element.className = 'pointer-events-none max-w-56 truncate rounded-md bg-black/70 px-2 py-0.5 text-sm text-white'
    const marker = new maplibregl.Marker({ element, anchor: 'top', offset: [0, 14] })
    let shown = false
    let frame = 0
    let last: MapMouseEvent | null = null

    const hide = () => {
      if (shown) marker.remove()
      shown = false
    }
    const areaOf = (id: number) => {
      const feature = features.current.find((f) => f.properties.id === id)
      return feature ? area(feature) : Infinity
    }
    const update = () => {
      frame = 0
      const event = last
      // While drawing or reshaping, the cursor belongs to the tool.
      if (!event || drawingStore.get().tool) return hide()
      const id = featureAt(map, event.point, areaOf)
      const text = id == null ? null : peekLabel(features.current.find((f) => f.properties.id === id), plantLabelOf)
      if (!text) return hide()
      element.textContent = text
      marker.setLngLat(event.lngLat)
      if (!shown) marker.addTo(map)
      shown = true
    }
    const onMove = (event: MapMouseEvent) => {
      last = event
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    const onLeave = () => {
      last = null
      hide()
    }
    map.on('mousemove', onMove)
    map.on('mouseout', onLeave)
    map.on('dragstart', onLeave)
    return () => {
      map.off('mousemove', onMove)
      map.off('mouseout', onLeave)
      map.off('dragstart', onLeave)
      if (frame) window.cancelAnimationFrame(frame)
      hide()
    }
  }, [map, hidden])

  return null
}
