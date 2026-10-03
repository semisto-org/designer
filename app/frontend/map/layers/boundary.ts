import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { MultiPolygon } from 'geojson'

export const BOUNDARY_SOURCE = 'boundary'

/** The terrain's outline, drawn above base layers and below features. */
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
    id: 'boundary-casing',
    type: 'line',
    source: BOUNDARY_SOURCE,
    paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.8 },
  })
  map.addLayer({
    id: 'boundary-line',
    type: 'line',
    source: BOUNDARY_SOURCE,
    paint: { 'line-color': '#5b5781', 'line-width': 2.5, 'line-dasharray': [3, 2] },
  })
}
