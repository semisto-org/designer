import type { LayerSpecification, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { useDrawingState } from '@/map/drawing/store'
import { setBaseFilter } from '@/map/drawing/style'
import { useEditor } from '@/map/editor/EditorContext'
import { featureAt } from '@/map/featurePick'
import { featureLabelFilter, LINE_LABEL_FILTER, ZONE_LABEL_FILTER } from '@/map/layers/features'
import {
  applyNameLayersVisibility, hoverFilter, hoverLayerId, hoverLayerSpec, NAME_LAYERS, PLANT_NAME_LAYER,
} from '@/map/labels/hover'

/** What each name layer names at all, without « Calques »'s own tests (they are composed in by setBaseFilter). */
const BASE_FILTERS: Record<string, unknown> = {
  'features-label': featureLabelFilter({ withPlants: false }),
  'zone-labels': ZONE_LABEL_FILTER,
  'zone-labels-line': LINE_LABEL_FILTER,
  [PLANT_NAME_LAYER]: null,
}

/** Adds the twin of each name layer present (once), showing the given elements' names. */
function installTwins(map: MapLibreMap, ids: number[]) {
  const missing = NAME_LAYERS.filter((id) => map.getLayer(id) && !map.getLayer(hoverLayerId(id)))
  if (!missing.length) return
  const specs = map.getStyle()?.layers ?? []
  for (const id of missing) {
    const spec = specs.find((layer) => layer.id === id)
    if (spec) map.addLayer(hoverLayerSpec(spec as LayerSpecification, ids, BASE_FILTERS[id]))
  }
}

function removeTwins(map: MapLibreMap) {
  for (const id of NAME_LAYERS) if (map.getLayer(hoverLayerId(id))) map.removeLayer(hoverLayerId(id))
}

function showNames(map: MapLibreMap, ids: number[]) {
  for (const id of NAME_LAYERS) {
    const twin = hoverLayerId(id)
    if (!map.getLayer(twin)) continue
    // The twins drawn from the features source keep what « Calques » hides.
    if (id === PLANT_NAME_LAYER) map.setFilter(twin, hoverFilter(id, ids, null) as never)
    else setBaseFilter(map, twin, hoverFilter(id, ids, BASE_FILTERS[id]))
  }
}

/**
 * Overlay without UI: with « Étiquettes » hidden in « Calques », hides the
 * names on the map and writes back only those of the element under the
 * pointer and of the selection (see map/labels/hover).
 */
export default function HoverLabelsOverlay() {
  const editor = useEditor()
  const map = editor.instance
  const hidden = useDrawingState((s) => s.labelsHidden)
  const selected = editor.selectedId != null ? [editor.selectedId, ...editor.selection] : editor.selection
  const selectedKey = [...new Set(selected)].sort((a, b) => a - b).join(',')
  const hovered = useRef<number | null>(null)
  const shown = useRef<string>('')
  const selectedIds = useRef<number[]>([])
  selectedIds.current = selectedKey ? selectedKey.split(',').map(Number) : []

  useEffect(() => {
    if (!hidden) {
      applyNameLayersVisibility(map, false)
      removeTwins(map)
      shown.current = ''
      return
    }
    const ids = () => [...new Set([...(hovered.current != null ? [hovered.current] : []), ...selectedIds.current])]
    const refresh = () => {
      const next = ids()
      const key = next.join(',')
      if (key === shown.current) return
      shown.current = key
      showNames(map, next)
    }
    // After a base map change the name layers come back as they were: hide them and add the twins again.
    const ensure = () => {
      if (!map.getStyle()) return
      applyNameLayersVisibility(map, true)
      const before = NAME_LAYERS.filter((id) => map.getLayer(hoverLayerId(id))).length
      installTwins(map, ids())
      if (NAME_LAYERS.filter((id) => map.getLayer(hoverLayerId(id))).length !== before) {
        shown.current = ''
        refresh()
      }
    }
    let frame = 0
    const onMove = (e: MapMouseEvent) => {
      if (frame) return
      const point = e.point
      frame = window.requestAnimationFrame(() => {
        frame = 0
        hovered.current = featureAt(map, point)
        refresh()
      })
    }
    const onOut = () => {
      hovered.current = null
      refresh()
    }
    ensure()
    map.on('styledata', ensure)
    map.on('mousemove', onMove)
    map.on('mouseout', onOut)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      map.off('styledata', ensure)
      map.off('mousemove', onMove)
      map.off('mouseout', onOut)
      hovered.current = null
    }
  }, [map, hidden])

  // The selection keeps its names shown: on a phone, a tap is the only way to read one.
  useEffect(() => {
    if (!hidden) return
    const ids = [...new Set([...(hovered.current != null ? [hovered.current] : []), ...selectedIds.current])]
    shown.current = ids.join(',')
    showNames(map, ids)
  }, [map, hidden, selectedKey])

  return null
}
