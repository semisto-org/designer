import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

const SOURCE = 'palette-plant-focus'
const RING = '#5b5781' // prune-600

/** A ring around the plant opened from the « Palette végétale », on its small map. */
export function installPlantFocus(map: MapLibreMap, point: [number, number]) {
  const data: GeoJSON.Feature = { type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties: {} }
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  map.addSource(SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: `${SOURCE}-ring`, type: 'circle', source: SOURCE,
    paint: { 'circle-radius': 14, 'circle-opacity': 0, 'circle-stroke-color': RING, 'circle-stroke-width': 3 },
  })
}
