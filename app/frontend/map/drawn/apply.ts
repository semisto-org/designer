import type { Map as MapLibreMap } from 'maplibre-gl'
import { PLAN_COLORS } from '@/map/plants/strataColors'
import { DRAWN_VIEW_STATE } from '@/map/scenario'
import { installContours, type Contours } from './contourLayer'
import { paperBefore, paperOpacity } from './rules'

/** The paper of the drawn view, laid between the photo and the plan. */
export const DRAWN_PAPER_LAYER = 'drawn-paper'

/**
 * Turns the « vue dessinée » on or off: the global state read by the paint
 * (existing things in ink and grey washes, water in slate, paths as
 * ribbons, the project drawn solid), then the paper over the photo at the
 * chosen share. Idempotent, so it can run again after any style change.
 */
export function applyDrawnView(map: MapLibreMap, on: boolean, photo: number, contours: Contours | null = null) {
  if (map.getGlobalState?.()[DRAWN_VIEW_STATE] !== on) map.setGlobalStateProperty(DRAWN_VIEW_STATE, on)
  const order = map.getLayersOrder()
  const before = paperBefore(order, (id) => String(map.getLayer(id)?.source ?? ''), DRAWN_PAPER_LAYER)
  if (!map.getLayer(DRAWN_PAPER_LAYER)) {
    if (!on) return
    map.addLayer({ id: DRAWN_PAPER_LAYER, type: 'background', paint: { 'background-color': PLAN_COLORS.paper, 'background-opacity': paperOpacity(photo) } }, before)
  } else if (before && order.indexOf(DRAWN_PAPER_LAYER) > order.indexOf(before)) {
    map.moveLayer(DRAWN_PAPER_LAYER, before)
  }
  if (map.getPaintProperty(DRAWN_PAPER_LAYER, 'background-opacity') !== paperOpacity(photo)) {
    map.setPaintProperty(DRAWN_PAPER_LAYER, 'background-opacity', paperOpacity(photo))
  }
  const visibility = on ? 'visible' : 'none'
  if (map.getLayoutProperty(DRAWN_PAPER_LAYER, 'visibility') !== visibility) map.setLayoutProperty(DRAWN_PAPER_LAYER, 'visibility', visibility)
  // The contour lines go on the paper: right above it, under the plan.
  installContours(map, contours, on, before)
}
