import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEditor } from '@/map/editor/EditorContext'
import { PLAN_COLORS } from '@/map/plants/strataColors'
import { PRESENT_RENDER_STATE } from '@/map/scenario'
import { isWorkingLayer, presentRender } from './renderRules'
import { usePresentation } from './store'

/**
 * The « rendu présentation »: while the editor presents a step in « Projet »,
 * the map dresses as a designer's plan instead of a working tool. Crowns
 * become soft washes of their strata colour, paths ribbons at their real
 * width, what is still a project draws solid, the aerial photo pales, and
 * the working marks step aside: names of elements and plants, plant numbers and points, notes,
 * soil points, photos, weather stations, pending changes, analysis rasters
 * and the region's overlays. Paint reads the MapLibre global state
 * `presentRender` (map/scenario); this module hides the working layers.
 */
export { isWorkingLayer, presentRender, RENDER_HIDDEN_LAYERS, renderHiddenLayers } from './renderRules'

export function usePresentRender(): boolean {
  const { mode } = useEditor()
  const presenting = usePresentation((s) => s.presenting)
  return presentRender(presenting, mode)
}

/** Layers this module hid, to give back as they were. */
const hiddenByRender = new WeakMap<MapLibreMap, Set<string>>()

/**
 * Turns the plan rendering on or off: the global state read by the paint,
 * then the working layers hidden (and given back afterwards). Idempotent,
 * so it can run again after any style change.
 */
export function applyPresentRender(map: MapLibreMap, on: boolean) {
  if (map.getGlobalState?.()[PRESENT_RENDER_STATE] !== on) map.setGlobalStateProperty(PRESENT_RENDER_STATE, on)
  layPaper(map, on)
  const hidden = hiddenByRender.get(map) ?? new Set<string>()
  hiddenByRender.set(map, hidden)
  if (on) {
    for (const id of map.getLayersOrder()) {
      // An overlay may show its layer again while presenting: hidden again.
      if (!isWorkingLayer(id) || map.getLayoutProperty(id, 'visibility') === 'none') continue
      map.setLayoutProperty(id, 'visibility', 'none')
      hidden.add(id)
    }
    return
  }
  for (const id of hidden) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible')
  }
  hidden.clear()
}

/** The notebook's paper, laid between the photo and the plan. */
export const PAPER_LAYER = 'present-paper'

/**
 * A wash of paper over the photo, under the first element of the plan: the
 * place stays readable, the design comes forward. Added once, under what the
 * map draws of the plan, and only made visible while presenting the project.
 */
function layPaper(map: MapLibreMap, on: boolean) {
  const order = map.getLayersOrder()
  const first = order.find((id) => id !== PAPER_LAYER && PLAN_SOURCES.has(String(map.getLayer(id)?.source ?? '')))
  if (!map.getLayer(PAPER_LAYER)) {
    if (!on) return
    map.addLayer({ id: PAPER_LAYER, type: 'background', paint: { 'background-color': PLAN_COLORS.paper, 'background-opacity': 0.35 } }, first)
  } else if (first && order.indexOf(PAPER_LAYER) > order.indexOf(first)) {
    map.moveLayer(PAPER_LAYER, first)
  }
  map.setLayoutProperty(PAPER_LAYER, 'visibility', on ? 'visible' : 'none')
}

/** Sources of what the plan draws: the elements and the plants' crowns. */
const PLAN_SOURCES = new Set(['features', 'plant-crowns', 'boundary', 'boundary-mask'])
