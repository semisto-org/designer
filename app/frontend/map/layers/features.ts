import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { PLANNED_OPACITY, PLANNED_PLANT_EXPR } from '@/map/scenario'
import { ensureLabelBackground, markerLabel } from '@/map/layers/labels'
import { measure } from '@/map/editor/measure'
import { isRoundedZone, isZoneKind, roundedGeometry, ZONE_FILL_OPACITY, ZONE_KINDS, zoneMeasureText } from '@/map/zones/zones'
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

/**
 * A feature's own colour (`style.color`), else `fallback`. The GeoJSON
 * source keeps nested objects as objects, but past its max zoom MapLibre
 * hands them over as JSON strings: read both, and never let a missing
 * colour fail the expression.
 */
function styleColorExpr(fallback: unknown): unknown {
  const json = ['string', ['var', 'style']]
  const at = ['index-of', '"color":"#', json]
  return ['let', 'style', ['get', 'style'], ['case',
    ['all', ['==', ['typeof', ['var', 'style']], 'object'], ['has', 'color', ['object', ['var', 'style']]]],
    ['to-color', ['get', 'color', ['object', ['var', 'style']]], fallback],
    ['all', ['==', ['typeof', ['var', 'style']], 'string'], ['>=', at, 0]],
    ['to-color', ['slice', json, ['+', at, 9], ['+', at, 16]], fallback],
    fallback,
  ]]
}

const layerColor = ['match', ['get', 'layer'], ...Object.entries(LAYER_COLORS).flat(), '#6e6355']
const color = styleColorExpr(layerColor) as string
const isZone = ['in', ['get', 'kind'], ['literal', ZONE_KINDS]]
// A plant's point takes its strata colour when the plants overlay set one
// (feature state, see PlantsOverlay), else the colour of its layer.
const pointColor = ['case', ['!=', ['feature-state', 'strataColor'], null], ['to-color', ['feature-state', 'strataColor']], color]

/**
 * Zones as the map draws them: rounded when asked (`rounded: true`), with
 * the measure written under their name (`zone_measure`), so every map that
 * shows features (editor, public map, dossier, printed plan) draws them the
 * same way.
 */
function withZones(data: MapFeatureCollection): MapFeatureCollection {
  if (!data.features.some((f) => isZoneKind(f.properties?.kind))) return data
  return {
    ...data,
    features: data.features.map((f) => {
      if (!isZoneKind(f.properties?.kind)) return f
      const geometry = isRoundedZone(f.properties) ? roundedGeometry(f.geometry) : f.geometry
      const text = zoneMeasureText(f.properties, measure(geometry))
      return { ...f, geometry, properties: text ? { ...f.properties, zone_measure: text } : f.properties }
    }),
  }
}

/**
 * A zone's name and, on a second smaller line, its measure; written in ink
 * with a white halo, like a note on a plan.
 */
function zoneLabelLayout(placement: 'point' | 'line-center') {
  const name = ['coalesce', ['get', 'name'], '']
  const measured = ['coalesce', ['get', 'zone_measure'], '']
  return {
    'text-field': ['format',
      name, { 'font-scale': 1 },
      ['case', ['all', ['!=', name, ''], ['!=', measured, '']], '\n', ''], {},
      measured, { 'font-scale': 0.8 },
    ],
    'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 17, 14, 20, 17],
    'text-font': ['Noto Sans Regular'],
    'text-max-width': 12,
    'symbol-placement': placement,
    'text-padding': 4,
  }
}

const ZONE_LABEL_PAINT = { 'text-color': '#1b1712', 'text-halo-color': 'rgba(255, 255, 255, 0.9)', 'text-halo-width': 2, 'text-halo-blur': 0.5 }

/** Adds (once) the GeoJSON source and the fill/line/point layers for features. */
export function installFeatureLayers(map: MapLibreMap, data: MapFeatureCollection) {
  ensureLabelBackground(map)
  data = withZones(data)
  if (map.getSource(FEATURES_SOURCE)) {
    ;(map.getSource(FEATURES_SOURCE) as GeoJSONSource).setData(data)
    return
  }
  map.addSource(FEATURES_SOURCE, { type: 'geojson', data, promoteId: 'id' })
  const draft = ['==', ['get', 'status'], 'draft']
  // A planned plant (not planted yet) is a hollow ring at 75 % opacity; a planted one is solid.
  const planned = PLANNED_PLANT_EXPR as never
  map.addLayer({
    id: 'features-fill',
    type: 'fill',
    source: FEATURES_SOURCE,
    filter: ['==', ['geometry-type'], 'Polygon'],
    // A named zone is drawn bolder than other surfaces: it is what the plan says.
    paint: { 'fill-color': color, 'fill-opacity': ['case', draft as never, 0.15, isZone as never, ZONE_FILL_OPACITY, 0.28] },
  })
  map.addLayer({
    id: 'features-line',
    type: 'line',
    source: FEATURES_SOURCE,
    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
    paint: {
      'line-color': color,
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, ['==', ['get', 'kind'], 'line'], 3, 2],
      'line-dasharray': ['case', draft as never, ['literal', [2, 2]], ['literal', [1, 0]]] as never,
    },
  })
  map.addLayer({
    id: 'features-point',
    type: 'circle',
    source: FEATURES_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': ['case', planned, '#ffffff', pointColor] as never,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 20, 9],
      'circle-stroke-color': ['case', planned, pointColor, '#ffffff'] as never,
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, planned, 3, 1.5],
      'circle-opacity': ['case', draft as never, 0.6, planned, PLANNED_OPACITY, 1],
      'circle-stroke-opacity': ['case', planned, PLANNED_OPACITY, 1] as never,
    },
  })
  map.addLayer({
    id: 'features-label',
    type: 'symbol',
    source: FEATURES_SOURCE,
    minzoom: 17,
    // A blank name (plants carry `name: null`) would still draw an empty pill
    // right over the point and hide its colour.
    filter: ['all', ['to-boolean', ['coalesce', ['get', 'name'], '']], ['!', isZone]] as never,
    ...markerLabel(['get', 'name']),
  })
  // Zones write their name (and measure) across them, from further out.
  map.addLayer({
    id: 'zone-labels',
    type: 'symbol',
    source: FEATURES_SOURCE,
    minzoom: 15,
    filter: ['all', ['==', ['get', 'kind'], 'zone'], ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], ['any', ['has', 'name'], ['has', 'zone_measure']]] as never,
    layout: zoneLabelLayout('point') as never,
    paint: ZONE_LABEL_PAINT,
  })
  map.addLayer({
    id: 'zone-labels-line',
    type: 'symbol',
    source: FEATURES_SOURCE,
    minzoom: 15,
    filter: ['all', ['==', ['get', 'kind'], 'line'], ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]], ['any', ['has', 'name'], ['has', 'zone_measure']]] as never,
    // Level, beside the middle of the path, as one writes along a hedge on a plan.
    layout: {
      ...zoneLabelLayout('line-center'),
      'text-rotation-alignment': 'viewport',
      'text-anchor': 'left',
      'text-justify': 'left',
      'text-offset': [0.8, 0],
    } as never,
    paint: ZONE_LABEL_PAINT,
  })
}
