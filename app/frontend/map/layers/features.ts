import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { MapFeatureCollection } from '@/types'

export const FEATURES_SOURCE = 'features'

// Colors per design layer (WASPA + survey), from the design tokens.
export const LAYER_COLORS: Record<string, string> = {
  existing: '#6e6355',
  water: '#2b7bb9',
  access: '#b8851a',
  structures: '#5b5781',
  plants: '#3d7d42',
  animals: '#946614',
  networks: '#c03c28',
  notes: '#726b9f',
}

const color = ['coalesce', ['get', 'color', ['get', 'style']], ['match', ['get', 'layer'],
  ...Object.entries(LAYER_COLORS).flat(), '#6e6355']] as unknown as string

/** Adds (once) the GeoJSON source and the fill/line/point layers for features. */
export function installFeatureLayers(map: MapLibreMap, data: MapFeatureCollection) {
  if (map.getSource(FEATURES_SOURCE)) {
    ;(map.getSource(FEATURES_SOURCE) as GeoJSONSource).setData(data)
    return
  }
  map.addSource(FEATURES_SOURCE, { type: 'geojson', data, promoteId: 'id' })
  const draft = ['==', ['get', 'status'], 'draft']
  map.addLayer({
    id: 'features-fill',
    type: 'fill',
    source: FEATURES_SOURCE,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': color, 'fill-opacity': ['case', draft as never, 0.15, 0.28] },
  })
  map.addLayer({
    id: 'features-line',
    type: 'line',
    source: FEATURES_SOURCE,
    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
    paint: {
      'line-color': color,
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, 2],
      'line-dasharray': ['case', draft as never, ['literal', [2, 2]], ['literal', [1, 0]]] as never,
    },
  })
  map.addLayer({
    id: 'features-point',
    type: 'circle',
    source: FEATURES_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': color,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 20, 9],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
      'circle-opacity': ['case', draft as never, 0.6, 1],
    },
  })
  map.addLayer({
    id: 'features-label',
    type: 'symbol',
    source: FEATURES_SOURCE,
    minzoom: 17,
    filter: ['has', 'name'],
    layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-font': ['Noto Sans Regular'] },
    paint: { 'text-color': '#262119', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
  })
}
