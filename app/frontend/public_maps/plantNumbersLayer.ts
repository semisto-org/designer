import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { PlantNumberProps } from './plantNumbers'

const SOURCE = 'public-plant-numbers'
const DISC = `${SOURCE}-disc`
const TEXT = `${SOURCE}-text`
const PLANTED = ['get', 'planted'] as unknown as boolean

/**
 * The published plants' pastilles, over the watercolour crowns: the strata
 * colour with the number in it, as on a hand-drawn planting plan (the same
 * look as the editor's « Numéro » mode). Hollow while not in the ground yet.
 * Idempotent: a second call only changes the data.
 */
export function paintPlantNumbers(map: MapLibreMap, data: FeatureCollection<Point, PlantNumberProps>) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  map.addSource(SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: DISC,
    type: 'circle',
    source: SOURCE,
    minzoom: 15,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, ['case', ['==', ['get', 'number'], ''], 3, 6], 17, ['case', ['==', ['get', 'number'], ''], 4, 9], 20, ['case', ['==', ['get', 'number'], ''], 6, 13]],
      'circle-color': ['case', PLANTED, ['get', 'color'], '#ffffff'],
      'circle-stroke-color': ['case', PLANTED, '#ffffff', ['get', 'color']],
      'circle-stroke-width': ['case', PLANTED, 1.5, 2.5],
      'circle-opacity': ['case', PLANTED, 1, 0.9],
    },
  })
  map.addLayer({
    id: TEXT,
    type: 'symbol',
    source: SOURCE,
    minzoom: 16,
    filter: ['!=', ['get', 'number'], ''],
    layout: {
      'text-field': ['get', 'number'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 16, 8, 17, 10, 20, 13],
      'text-font': ['Noto Sans Regular'],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': ['case', PLANTED, ['get', 'ink'], '#1b1712'] },
  })
}

export function setPlantNumbersVisible(map: MapLibreMap, visible: boolean) {
  for (const id of [DISC, TEXT]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}

export function removePlantNumbers(map: MapLibreMap) {
  for (const id of [TEXT, DISC]) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(SOURCE)) map.removeSource(SOURCE)
}
