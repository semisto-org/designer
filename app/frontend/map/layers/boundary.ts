import { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import type { MultiPolygon } from 'geojson'
import { stackFeatureLayers } from '@/map/layers/stack'
import { PLAN_COLORS } from '@/map/plants/strataColors'
import { IN_PRESENT_RENDER } from '@/map/scenario'

export const BOUNDARY_SOURCE = 'boundary'

/**
 * The terrain's outline, drawn above base layers and below features: a soft
 * plum fill and a plum line on a white casing, so it reads on any base map.
 */
export function installBoundary(map: MapLibreMap, boundary: MultiPolygon | null) {
  const data = boundary
    ? { type: 'Feature' as const, geometry: boundary, properties: {} }
    : { type: 'FeatureCollection' as const, features: [] }
  const mask = boundaryMask(boundary)
  if (map.getSource(BOUNDARY_SOURCE)) {
    ;(map.getSource(BOUNDARY_SOURCE) as GeoJSONSource).setData(data)
    ;(map.getSource(BOUNDARY_MASK_SOURCE) as GeoJSONSource | undefined)?.setData(mask)
    return
  }
  map.addSource(BOUNDARY_SOURCE, { type: 'geojson', data })
  map.addSource(BOUNDARY_MASK_SOURCE, { type: 'geojson', data: mask })
  const render = IN_PRESENT_RENDER as never
  // « Rendu présentation »: around the terrain, the land fades into the
  // paper, so the eye stays on the place being designed.
  map.addLayer({
    id: 'boundary-mask',
    type: 'fill',
    source: BOUNDARY_MASK_SOURCE,
    paint: { 'fill-color': PLAN_COLORS.paper, 'fill-opacity': ['case', render, 0.32, 0] as never },
  })
  map.addLayer({
    id: 'boundary-fill',
    type: 'fill',
    source: BOUNDARY_SOURCE,
    paint: { 'fill-color': '#5b5781', 'fill-opacity': ['case', render, 0, 0.18] as never },
  })
  // On a designer's plan the outline is a fine ink line, not a band.
  map.addLayer({
    id: 'boundary-casing',
    type: 'line',
    source: BOUNDARY_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['case', render, 3, 6] as never, 'line-opacity': ['case', render, 0.5, 1] as never },
  })
  map.addLayer({
    id: 'boundary-line',
    type: 'line',
    source: BOUNDARY_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['case', render, PLAN_COLORS.ink, '#5b5781'] as never,
      'line-width': ['case', render, 1.5, 3] as never,
      'line-dasharray': ['case', render, ['literal', [4, 2]], ['literal', [1, 0]]] as never,
    },
  })
  // Under the features, even when they were there first.
  stackFeatureLayers(map)
}

export const BOUNDARY_MASK_SOURCE = 'boundary-mask'

/** The world with the terrain cut out of it: what fades around the place. */
export function boundaryMask(boundary: MultiPolygon | null) {
  if (!boundary) return { type: 'FeatureCollection' as const, features: [] }
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
  const holes = boundary.coordinates.map((polygon) => polygon[0])
  return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [world, ...holes] }, properties: {} }
}
