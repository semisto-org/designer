import { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import type { MultiPolygon } from 'geojson'

export const BOUNDARY_SOURCE = 'boundary'

/**
 * The terrain's outline, drawn above base layers and below features: a soft
 * plum fill and a plum line on a white casing, so it reads on any base map.
 */
export function installBoundary(map: MapLibreMap, boundary: MultiPolygon | null) {
  const data = boundary
    ? { type: 'Feature' as const, geometry: boundary, properties: {} }
    : { type: 'FeatureCollection' as const, features: [] }
  if (map.getSource(BOUNDARY_SOURCE)) {
    ;(map.getSource(BOUNDARY_SOURCE) as GeoJSONSource).setData(data)
    return
  }
  map.addSource(BOUNDARY_SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: 'boundary-fill',
    type: 'fill',
    source: BOUNDARY_SOURCE,
    paint: { 'fill-color': '#5b5781', 'fill-opacity': 0.18 },
  })
  map.addLayer({
    id: 'boundary-casing',
    type: 'line',
    source: BOUNDARY_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 6 },
  })
  map.addLayer({
    id: 'boundary-line',
    type: 'line',
    source: BOUNDARY_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#5b5781', 'line-width': 3 },
  })
}
