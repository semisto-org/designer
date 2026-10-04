import type { Feature, FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, SymbolLayerSpecification } from 'maplibre-gl'
import type { BioObservation, SoilSampleData, SuggestedPoint } from '@/types/soil_photos'

export const SAMPLES_SOURCE = 'soil-samples'
export const SUGGESTIONS_SOURCE = 'soil-suggestions'
export const OBSERVATIONS_SOURCE = 'soil-observations'
export const SAMPLE_LAYER = 'soil-samples-circle'
export const OBSERVATION_LAYER = 'soil-observations-circle'
export const SUGGESTION_LAYER = 'soil-suggestions-circle'
export const SOIL_LAYER_IDS = [
  'soil-samples-halo', SAMPLE_LAYER, 'soil-samples-label',
  OBSERVATION_LAYER, 'soil-observations-label',
  SUGGESTION_LAYER, 'soil-suggestions-rank',
] as const

const LEAF = '#3d7d42'
const LEAF_DARK = '#264f2b'
const PRUNE = '#5b5781'
const HUMUS = '#d9a527'
const FONT = ['Noto Sans Regular']

type Props = { id: number; label: string; status?: string }
type Collection = FeatureCollection<Point, Props>

const point = (lng: number, lat: number, id: number, props: Omit<Props, 'id'>): Feature<Point, Props> => ({
  type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { id, ...props },
})

export const samplesToGeoJSON = (samples: SoilSampleData[]): Collection => ({
  type: 'FeatureCollection',
  features: samples.filter((s) => s.lng != null && s.lat != null).map((s) => point(s.lng as number, s.lat as number, s.id, { label: s.label, status: s.status })),
})

export const observationsToGeoJSON = (observations: BioObservation[]): Collection => ({
  type: 'FeatureCollection',
  features: observations.filter((o) => o.lng != null && o.lat != null).map((o) => point(o.lng as number, o.lat as number, o.id, { label: o.speciesName })),
})

export const suggestionsToGeoJSON = (points: SuggestedPoint[]): Collection => ({
  type: 'FeatureCollection',
  features: points.map((p) => point(p.lng, p.lat, p.rank, { label: String(p.rank) })),
})

/** Sets the data of a source, creating it first when needed. Returns true when it was created. */
function setData(map: MapLibreMap, id: string, data: Collection): boolean {
  const source = map.getSource(id) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return false
  }
  map.addSource(id, { type: 'geojson', data })
  return true
}

/** Keeps the soil layers above the drawn features (their order depends on who mounted first). */
function raise(map: MapLibreMap) {
  SOIL_LAYER_IDS.forEach((id) => map.getLayer(id) && map.moveLayer(id))
}

const labelLayout: NonNullable<SymbolLayerSpecification['layout']> = {
  'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true,
}
const labelPaint: NonNullable<SymbolLayerSpecification['paint']> = { 'text-color': LEAF_DARK, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 }

/**
 * Installs (once) the layers of the « Sol » module, then only updates their
 * data: sampling points (hollow = to sample, filled = sampled), the suggested
 * positions (numbered, not saved) and the plants noted on the terrain.
 */
export function installSoilLayers(map: MapLibreMap, data: { samples: Collection; observations: Collection; suggestions: Collection }) {
  const created = [
    setData(map, SAMPLES_SOURCE, data.samples),
    setData(map, OBSERVATIONS_SOURCE, data.observations),
    setData(map, SUGGESTIONS_SOURCE, data.suggestions),
  ].some(Boolean)
  if (!created) {
    raise(map)
    return
  }
  map.addLayer({
    id: 'soil-samples-halo', type: 'circle', source: SAMPLES_SOURCE, filter: ['==', ['get', 'id'], -1],
    paint: { 'circle-radius': 17, 'circle-color': LEAF, 'circle-opacity': 0.25, 'circle-stroke-color': LEAF, 'circle-stroke-width': 2 },
  })
  map.addLayer({
    id: SAMPLE_LAYER, type: 'circle', source: SAMPLES_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 6, 19, 10],
      'circle-color': ['case', ['==', ['get', 'status'], 'sampled'], LEAF, '#ffffff'],
      'circle-stroke-color': LEAF, 'circle-stroke-width': 3,
    },
  })
  map.addLayer({ id: 'soil-samples-label', type: 'symbol', source: SAMPLES_SOURCE, minzoom: 15, layout: labelLayout, paint: labelPaint })
  map.addLayer({
    id: OBSERVATION_LAYER, type: 'circle', source: OBSERVATIONS_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 19, 7],
      'circle-color': HUMUS, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'soil-observations-label', type: 'symbol', source: OBSERVATIONS_SOURCE, minzoom: 17,
    layout: { ...labelLayout, 'text-offset': [0, 1] }, paint: { ...labelPaint, 'text-color': '#724f10' },
  })
  map.addLayer({
    id: SUGGESTION_LAYER, type: 'circle', source: SUGGESTIONS_SOURCE,
    paint: { 'circle-radius': 12, 'circle-color': PRUNE, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
  })
  map.addLayer({
    id: 'soil-suggestions-rank', type: 'symbol', source: SUGGESTIONS_SOURCE,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#ffffff' },
  })
  raise(map)
}

export function setSoilLayersVisible(map: MapLibreMap, visible: boolean) {
  SOIL_LAYER_IDS.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'))
}

export function highlightSample(map: MapLibreMap, id: number | null) {
  if (map.getLayer('soil-samples-halo')) map.setFilter('soil-samples-halo', ['==', ['get', 'id'], id ?? -1])
}

export function removeSoilLayers(map: MapLibreMap) {
  if (!map.getStyle()) return
  SOIL_LAYER_IDS.forEach((id) => map.getLayer(id) && map.removeLayer(id))
  ;[SAMPLES_SOURCE, OBSERVATIONS_SOURCE, SUGGESTIONS_SOURCE].forEach((id) => map.getSource(id) && map.removeSource(id))
}
