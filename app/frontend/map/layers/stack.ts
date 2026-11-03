import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * The order in which a plan reads, bottom to top: the terrain's outline,
 * then the surfaces and lines (zones, beds, paths, ponds…), then the plants
 * (trees already there and planted or planned crowns), then the points and
 * their glyphs, and the names last. A zone is a wash under the garden: it
 * must never veil a tree.
 *
 * Several modules add these layers, each « before » a neighbour that may not
 * be there yet, and a base map change or a fresh install adds some again on
 * top: the order drifts. `stackFeatureLayers` puts it back, and moves nothing
 * when it is already right, so it is safe on every `styledata`.
 */
export const FEATURE_STACK = [
  // The terrain's outline.
  'boundary-fill', 'boundary-casing', 'boundary-line',
  // Surfaces and lines: zones and other generic shapes, then the library's.
  'features-fill', 'features-line',
  'drawing-fill', 'drawing-pattern', 'drawing-line-casing', 'drawing-line', 'drawing-line-arrow',
  // Plants: trees already there (true-size crowns), then the plants' crowns,
  // each sorted by strata within its layer (see PlantsOverlay).
  'drawing-crown',
  'plant-crowns-fill', 'plant-crowns-reach', 'plant-crowns-support', 'plant-crowns-reach-line', 'plant-crowns-casing', 'plant-crowns-line',
  // Points and their glyphs, over the crowns they mark.
  'features-point', 'drawing-point', 'drawing-icon',
  // Names: measures, plants, then the other features (placed first, on top).
  'drawing-measure-label', 'plant-labels-text', 'features-label', 'zone-labels', 'zone-labels-line',
]

/**
 * The moves that put the stack's layers present in `order` (the map's layer
 * ids, bottom to top) in `FEATURE_STACK` order, right under the first other
 * layer above the highest of them; [] when they already are in order.
 * Layers outside the stack keep their place: those below stay below, those
 * above (selection, photos, pending updates…) stay above.
 */
export function stackMoves(order: string[]): { id: string; before: string | undefined }[] {
  const present = FEATURE_STACK.filter((id) => order.includes(id))
  const positions = present.map((id) => order.indexOf(id))
  if (positions.every((position, i) => i === 0 || positions[i - 1] < position)) return []
  const top = Math.max(...positions)
  const stack = new Set(FEATURE_STACK)
  const before = order.slice(top + 1).find((id) => !stack.has(id))
  return present.map((id) => ({ id, before }))
}

/** Puts the feature layers back in reading order (see FEATURE_STACK). */
export function stackFeatureLayers(map: MapLibreMap) {
  if (!map.getStyle()) return
  for (const { id, before } of stackMoves(map.getLayersOrder())) map.moveLayer(id, before)
}
