import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { PLANNED_ELEMENT_EXPR, PLANNED_OPACITY, PLANNED_PLANT_EXPR, TO_REMOVE_EXPR, TO_REMOVE_OPACITY } from '@/map/scenario'
import { ensureLabelBackground, markerLabel, PAPER_LABEL_IMAGE } from '@/map/layers/labels'
import { measure } from '@/map/editor/measure'
import { displayGeometry, isRounded, isZoneKind, ZONE_FILL_OPACITY, ZONE_KINDS, zoneMeasureText } from '@/map/zones/zones'
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
 * Features as the map draws them: rounded when asked (`rounded: true`, any
 * surface), zones with the measure written under their name
 * (`zone_measure`), so every map that shows features (editor, public map,
 * dossier, printed plan) draws them the same way.
 */
function withZones(data: MapFeatureCollection): MapFeatureCollection {
  if (!data.features.some((f) => isZoneKind(f.properties?.kind) || isRounded(f.properties))) return data
  return {
    ...data,
    features: data.features.map((f) => {
      if (!isZoneKind(f.properties?.kind) && !isRounded(f.properties)) return f
      const geometry = displayGeometry(f)
      if (!isZoneKind(f.properties?.kind)) return { ...f, geometry }
      const text = zoneMeasureText(f.properties, measure(geometry))
      return { ...f, geometry, properties: text ? { ...f.properties, zone_measure: text } : f.properties }
    }),
  }
}

/**
 * A zone's name and, on a second smaller line, its measure, written in ink
 * on a paper label, like a note stuck on a plan: readable on a grey roof,
 * a dark wood or a busy aerial photo, where a thin halo was lost.
 */
export function zoneLabelLayout(placement: 'point' | 'line-center') {
  const name = ['coalesce', ['get', 'name'], '']
  const measured = ['coalesce', ['get', 'zone_measure'], '']
  return {
    'text-field': ['format',
      name, { 'font-scale': 1, 'text-font': ['literal', ['Noto Sans Bold']] },
      ['case', ['all', ['!=', name, ''], ['!=', measured, '']], '\n', ''], {},
      measured, { 'font-scale': 0.9, 'text-color': ZONE_MEASURE_COLOR },
    ],
    // Small and steady, like a pencilled note: the label must not hide the zone it names.
    'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 12, 21, 13],
    'text-font': ['Noto Sans Regular'],
    'text-max-width': 10,
    'text-line-height': 1.15,
    'symbol-placement': placement,
    'text-padding': 4,
    'icon-image': PAPER_LABEL_IMAGE,
    'icon-text-fit': 'both',
    'icon-text-fit-padding': [1, 4, 1, 4],
  }
}

/** loam-900 for the name, loam-600 for the measure under it. */
const ZONE_MEASURE_COLOR = '#4d4a45'
export const ZONE_LABEL_PAINT = { 'text-color': '#1a1a1a' }

const isPlantPoint = ['all', ['==', ['get', 'layer'], 'plants'], ['==', ['get', 'kind'], 'plant']]

/**
 * Named points and surfaces that get a pill. A blank name (plants carry
 * `name: null`) would still draw an empty pill right over the point and
 * hide its colour. The editor's plants overlay names plants itself, by
 * crown size (see map/plants/labelRank): there, `withPlants: false`.
 */
export function featureLabelFilter({ withPlants = true }: { withPlants?: boolean } = {}): unknown[] {
  const filter: unknown[] = ['all', ['to-boolean', ['coalesce', ['get', 'name'], '']], ['!', isZone]]
  if (!withPlants) filter.push(['!', isPlantPoint])
  return filter
}

/**
 * Sectors are not drawn with the other features: their arcs only make sense
 * together, on their own rings around the terrain (the editor's « Secteurs »
 * panel, the dossier's sector page). Nor are the permaculture zones, which
 * would cover the whole plan: the « Zones » panel shows them.
 */
const OWN_PANEL_KINDS = ['sector', 'permaculture_zone']

function withoutSectors(data: MapFeatureCollection): MapFeatureCollection {
  if (!data.features.some((f) => OWN_PANEL_KINDS.includes(f.properties?.kind as string))) return data
  return { ...data, features: data.features.filter((f) => !OWN_PANEL_KINDS.includes(f.properties?.kind as string)) }
}

/** Adds (once) the GeoJSON source and the fill/line/point layers for features. */
export function installFeatureLayers(map: MapLibreMap, data: MapFeatureCollection) {
  ensureLabelBackground(map)
  data = withZones(withoutSectors(data))
  if (map.getSource(FEATURES_SOURCE)) {
    ;(map.getSource(FEATURES_SOURCE) as GeoJSONSource).setData(data)
    return
  }
  map.addSource(FEATURES_SOURCE, { type: 'geojson', data, promoteId: 'id' })
  const draft = ['==', ['get', 'status'], 'draft']
  // A planned plant (not planted yet) is a hollow ring at 75 % opacity; a planted one is solid.
  const planned = PLANNED_PLANT_EXPR as never
  // A planned element (pond, hedge…) is a dashed outline over a fainter fill.
  const plannedElement = PLANNED_ELEMENT_EXPR as never
  // What the project takes away is still there: dotted and faded.
  const toRemove = TO_REMOVE_EXPR as never
  map.addLayer({
    id: 'features-fill',
    type: 'fill',
    source: FEATURES_SOURCE,
    filter: ['==', ['geometry-type'], 'Polygon'],
    // A named zone is drawn bolder than other surfaces: it is what the plan says.
    paint: { 'fill-color': color, 'fill-opacity': ['case', draft as never, 0.15, plannedElement, 0.12, isZone as never, ZONE_FILL_OPACITY, 0.28] },
  })
  map.addLayer({
    id: 'features-line',
    type: 'line',
    source: FEATURES_SOURCE,
    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
    paint: {
      'line-color': color,
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, ['==', ['get', 'kind'], 'line'], 3, 2],
      'line-dasharray': ['case', draft as never, ['literal', [2, 2]], plannedElement, ['literal', [3, 2]], toRemove, ['literal', [0.6, 1.6]], ['literal', [1, 0]]] as never,
      'line-opacity': ['case', plannedElement, PLANNED_OPACITY, toRemove, TO_REMOVE_OPACITY, 1] as never,
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
      'circle-opacity': ['case', draft as never, 0.6, ['any', planned, plannedElement], PLANNED_OPACITY, 1],
      'circle-stroke-opacity': ['case', planned, PLANNED_OPACITY, 1] as never,
    },
  })
  map.addLayer({
    id: 'features-label',
    type: 'symbol',
    source: FEATURES_SOURCE,
    minzoom: 17,
    filter: featureLabelFilter() as never,
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
