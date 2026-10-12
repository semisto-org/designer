import type { Map as MapLibreMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl'

// Which drawn element a click selects when several lie under the cursor:
// the most precise one wins. A plant (its dot or its name) beats the zone it
// sits in, a line beats the area around it, and of two nested zones the
// smaller one wins. MapLibre fires one listener per layer, so a listener per
// layer let the last one (the zone's fill) override the plant.

/** Layers that select something, from the most precise to the widest. */
export const PICK_LAYERS = [
  'features-point',
  'plant-labels-text',
  'features-label',
  'features-line',
  'plant-crowns-fill',
  'features-fill',
] as const

// Dots and names are small: a click a few pixels off still reaches them.
const TOLERANT_LAYERS = new Set<string>(['features-point', 'plant-labels-text', 'features-label'])
export const TOLERANCE_PX = 6

export type Hit = { layer: string; id: number | null }

/** The id of the element to select among the hits, or null. */
export function pickFeature(hits: Hit[], areaOf: (id: number) => number = () => 0): number | null {
  let best: { rank: number; area: number; id: number } | null = null
  for (const hit of hits) {
    if (hit.id == null) continue
    const rank = PICK_LAYERS.indexOf(hit.layer as (typeof PICK_LAYERS)[number])
    if (rank < 0) continue
    const area = hit.layer === 'features-fill' ? areaOf(hit.id) : 0
    if (!best || rank < best.rank || (rank === best.rank && area < best.area)) best = { rank, area, id: hit.id }
  }
  return best?.id ?? null
}

// Drawn elements carry their id as the feature id; the plant overlay's
// crowns and names carry it as `featureId`.
function hitOf(feature: MapGeoJSONFeature): Hit {
  const raw = feature.layer.id.startsWith('plant-') ? feature.properties?.featureId : feature.id
  const id = raw == null || raw === '' ? null : Number(raw)
  return { layer: feature.layer.id, id: id != null && Number.isFinite(id) ? id : null }
}

type Pickable = Pick<MapLibreMap, 'getLayer' | 'queryRenderedFeatures'>

/** Everything selectable under a screen point (with a small margin for dots and names). */
export function hitsAt(map: Pickable, point: { x: number; y: number }): Hit[] {
  const present = PICK_LAYERS.filter((id) => map.getLayer(id))
  const tolerant = present.filter((id) => TOLERANT_LAYERS.has(id))
  const exact = present.filter((id) => !TOLERANT_LAYERS.has(id))
  const box: [PointLike, PointLike] = [[point.x - TOLERANCE_PX, point.y - TOLERANCE_PX], [point.x + TOLERANCE_PX, point.y + TOLERANCE_PX]]
  const found = [
    ...(tolerant.length ? map.queryRenderedFeatures(box, { layers: tolerant }) : []),
    ...(exact.length ? map.queryRenderedFeatures([point.x, point.y], { layers: exact }) : []),
  ]
  return found.map(hitOf)
}

/** The element a click at this point selects, or null. */
export function featureAt(map: Pickable, point: { x: number; y: number }, areaOf?: (id: number) => number): number | null {
  return pickFeature(hitsAt(map, point), areaOf)
}
