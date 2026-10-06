import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
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

/** Top middle of the outline: where its name tag sits. */
export function boundaryTop(boundary: MultiPolygon): [number, number] {
  let minX = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const polygon of boundary.coordinates) {
    for (const [x, y] of polygon[0] ?? []) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return [(minX + maxX) / 2, maxY]
}

/** The terrain's name and size in a small card just above the outline. */
export function installBoundaryLabel(map: MapLibreMap, boundary: MultiPolygon | null, name: string, size: string | null) {
  if (!boundary || boundary.coordinates.length === 0) return () => {}
  const element = document.createElement('div')
  element.className = 'boundary-label'
  element.setAttribute('aria-hidden', 'true')
  const title = document.createElement('span')
  title.className = 'boundary-label-name'
  title.textContent = name
  element.append(title)
  if (size) {
    const detail = document.createElement('span')
    detail.className = 'boundary-label-size'
    detail.textContent = ` · ${size}`
    element.append(detail)
  }
  const marker = new Marker({ element, anchor: 'bottom', offset: [0, -10] }).setLngLat(boundaryTop(boundary)).addTo(map)
  return () => void marker.remove()
}
