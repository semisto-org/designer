import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'

const WATER = '#2b7bb9'

export type PreviewRole = 'valley' | 'keyline' | 'parallel'

/**
 * A preview of keyline lines on the map, above the drawn elements: valley
 * floors as a thin dotted line, keylines and parallels dashed on a white
 * casing. Idempotent per `id`; returns the cleanup. Numbered points
 * (keypoints) are HTML markers so they need no glyphs.
 */
export function installKeylinePreview(
  map: MapLibreMap,
  id: string,
  features: Array<Feature & { properties: { role: PreviewRole } }>,
  points: Array<{ lng: number; lat: number; label: string; onClick?: () => void }> = [],
): () => void {
  const source = `keyline-preview-${id}`
  const layers = [`${source}-casing`, `${source}-line`]
  const data: FeatureCollection = { type: 'FeatureCollection', features }

  const install = () => {
    const existing = map.getSource(source) as GeoJSONSource | undefined
    if (existing) {
      existing.setData(data)
      return
    }
    map.addSource(source, { type: 'geojson', data })
    map.addLayer({
      id: layers[0], type: 'line', source, filter: ['!=', ['get', 'role'], 'valley'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 },
    })
    map.addLayer({
      id: layers[1], type: 'line', source,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': WATER,
        'line-width': ['match', ['get', 'role'], 'valley', 2, 'keyline', 3.5, 2.5],
        'line-dasharray': ['match', ['get', 'role'], 'valley', ['literal', [0.5, 2]], ['literal', [3, 1.5]]],
        'line-opacity': ['match', ['get', 'role'], 'valley', 0.7, 0.95],
      },
    })
  }
  const timer = window.setTimeout(install, 0)
  const reinstall = () => { if (!map.getSource(source)) install() }
  map.on('styledata', reinstall)

  const markers = points.map((point) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'keypoint-marker'
    const label = document.createElement('span')
    label.dataset.label = point.label
    element.setAttribute('aria-label', point.label)
    element.append(label)
    if (point.onClick) element.addEventListener('click', point.onClick)
    return new Marker({ element, anchor: 'bottom' }).setLngLat([point.lng, point.lat]).addTo(map)
  })

  return () => {
    window.clearTimeout(timer)
    map.off('styledata', reinstall)
    markers.forEach((marker) => marker.remove())
    layers.forEach((layer) => map.getLayer(layer) && map.removeLayer(layer))
    if (map.getSource(source)) map.removeSource(source)
  }
}
