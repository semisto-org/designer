import type { Feature, Geometry, Polygon } from 'geojson'
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl'
import { COLOR_SWATCHES, ELEMENTS } from '@/map/drawing/catalog'
import { drawIcon, ICON_NAMES } from '@/map/drawing/icons'
import { FEATURES_SOURCE } from '@/map/layers/features'
import { scenarioFilter, type Scenario } from '@/map/scenario'
import type { ElementSpec } from '@/types/drawing'

/**
 * Per-kind styling of the element library on a MapLibre map: fills,
 * hatches, dashed lines, casings, true-size tree crowns, round badges with
 * the kind's icon, measure labels. The editor's generic feature layers
 * (features-fill/line/point) keep rendering everything else (plants…) and
 * stay the click targets: for library kinds they become transparent, with a
 * hit area as large as the drawn symbol.
 *
 * Used by the editor map and by the offscreen map of the PDF export.
 */
export const DRAWING_LAYER_PREFIX = 'drawing-'
/** Transient layers (measure, print frame), never printed. */
export const TRANSIENT_PREFIX = 'drawing-tmp-'
const BEFORE_LAYER = 'features-label'
const BASE_LAYERS = ['features-fill', 'features-line', 'features-point']

const LIBRARY = Object.values(ELEMENTS)
const KINDS = LIBRARY.map((e) => e.kind)
const NETWORK_COLORS: Record<string, string> = { water: '#2563eb', gas: '#ca8a04', electricity: '#d97706', ethernet: '#7c3aed' }

type Expr = ExpressionSpecification
const expr = (value: unknown) => value as Expr

const isLibrary = expr(['in', ['get', 'kind'], ['literal', KINDS]])
const isDraft = expr(['==', ['get', 'status'], 'draft'])
const selected = expr(['boolean', ['feature-state', 'selected'], false])
const editing = expr(['boolean', ['feature-state', 'editing'], false])

/** ['match', ['get', 'kind'], …] grouping kinds that share an output. */
function byKind<T>(pick: (e: ElementSpec) => T | undefined, fallback: T, elements: ElementSpec[] = LIBRARY): Expr {
  const groups = new Map<string, { value: T; kinds: string[] }>()
  for (const element of elements) {
    const value = pick(element)
    if (value === undefined) continue
    const key = JSON.stringify(value)
    const group = groups.get(key) ?? { value, kinds: [] }
    group.kinds.push(element.kind)
    groups.set(key, group)
  }
  const literal = (v: T) => (Array.isArray(v) ? ['literal', v] : v)
  if (groups.size === 0) return expr(literal(fallback))
  return expr(['match', ['get', 'kind'], ...[...groups.values()].flatMap((g) => [g.kinds, literal(g.value)]), literal(fallback)])
}

const kindColor = byKind((e) => e.color, '#6e6355')
const networkColor = expr(['match', ['get', 'network'], ...Object.entries(NETWORK_COLORS).flat(), kindColor])
/**
 * A feature's colour: `style.color`, else its network, else its kind.
 * The GeoJSON source keeps nested objects as objects, but tiles parsed
 * again from their encoded form (overscaled zooms) carry them as JSON
 * strings: read both, and never let a missing colour fail the expression.
 */
const STYLE_JSON = ['string', ['var', 'style']]
const COLOR_AT = ['index-of', '"color":"#', STYLE_JSON]
export const featureColorExpr = expr(['let', 'style', ['get', 'style'], [
  'case',
  ['all', ['==', ['typeof', ['var', 'style']], 'object'], ['has', 'color', ['object', ['var', 'style']]]],
  ['to-string', ['get', 'color', ['object', ['var', 'style']]]],
  ['all', ['==', ['typeof', ['var', 'style']], 'string'], ['>=', COLOR_AT, 0]],
  ['slice', STYLE_JSON, ['+', COLOR_AT, 9], ['+', COLOR_AT, 16]],
  ['case', ['all', ['==', ['geometry-type'], 'Point'], ['has', 'network']], networkColor, kindColor],
]])

const lineWidth = byKind((e) => e.line?.width, 2)
const lineOpacity = byKind((e) => e.line?.opacity, 1)
const lineDash = byKind((e) => e.line?.dash, [1, 0])
const fillOpacity = byKind((e) => e.fill?.opacity, 0.3)
const patterned = LIBRARY.filter((e) => e.fill?.pattern)
const cased = LIBRARY.filter((e) => e.line?.casing)
const crowned = LIBRARY.filter((e) => e.crown)
const pointKinds = LIBRARY.filter((e) => e.geometries.includes('Point'))

/** Opacity factor: hidden while its shape is edited, faded when a draft. */
const visibleFactor = expr(['case', editing, 0, isDraft, 0.5, 1])

function zoomScaled(base: Expr, stops: [number, number][], extraSelected = 0): Expr {
  return expr(['interpolate', ['linear'], ['zoom'],
    ...stops.flatMap(([zoom, factor]) => [zoom, ['+', ['*', base, factor], ['case', selected, extraSelected, 0]]])])
}

const POINT_RADIUS: [number, number][] = [[14, 5], [17, 8], [19, 11], [22, 14]]
const pointRadius = expr(['interpolate', ['linear'], ['zoom'], ...POINT_RADIUS.flatMap(([z, r]) => [z, ['+', r, ['case', selected, 2, 0]]])])

const libraryFilter = (geometry: string[], kinds?: ElementSpec[]): FilterSpecification =>
  ['all',
    ['in', ['geometry-type'], ['literal', geometry]],
    kinds ? ['in', ['get', 'kind'], ['literal', kinds.map((k) => k.kind)]] : isLibrary,
  ] as unknown as FilterSpecification

/** Pixels per meter on the ground at a zoom level (512 px tiles). */
function pixelsPerMeter(zoom: number, latitude: number) {
  return (512 * 2 ** zoom) / (40075016.686 * Math.cos((latitude * Math.PI) / 180))
}

const DRAWING_LAYER_IDS = ['drawing-fill', 'drawing-pattern', 'drawing-crown', 'drawing-line-casing', 'drawing-line', 'drawing-point', 'drawing-icon', 'drawing-measure-label']

function drawingLayers(latitude: number): LayerSpecification[] {
  const crownProperties = [...new Set(crowned.map((e) => e.crown as string))]
  const crownDiameter = expr(['to-number', ['coalesce', ...crownProperties.map((p) => ['get', p]), 0], 0])
  const crownRadius = (zoom: number) => expr(['*', ['/', crownDiameter, 2], pixelsPerMeter(zoom, latitude)])
  return [
    {
      id: 'drawing-fill',
      type: 'fill',
      source: FEATURES_SOURCE,
      filter: libraryFilter(['Polygon']),
      paint: {
        'fill-color': featureColorExpr,
        'fill-opacity': expr(['*', ['+', fillOpacity, ['case', selected, 0.1, 0]], visibleFactor, ['case', ['in', ['get', 'kind'], ['literal', patterned.map((e) => e.kind)]], 0.6, 1]]),
      },
    },
    {
      id: 'drawing-pattern',
      type: 'fill',
      source: FEATURES_SOURCE,
      filter: libraryFilter(['Polygon'], patterned),
      paint: {
        'fill-pattern': expr(['concat', 'drawing-', byKind((e) => e.fill?.pattern, 'hatch', patterned), '-', ['downcase', featureColorExpr]]),
        'fill-opacity': expr(['*', 0.9, visibleFactor]),
      },
    },
    {
      id: 'drawing-crown',
      type: 'circle',
      source: FEATURES_SOURCE,
      filter: libraryFilter(['Point'], crowned),
      paint: {
        'circle-radius': expr(['interpolate', ['exponential', 2], ['zoom'], 12, crownRadius(12), 24, crownRadius(24)]),
        'circle-color': featureColorExpr,
        'circle-opacity': expr(['*', ['case', selected, 0.3, 0.2], visibleFactor]),
        'circle-stroke-color': featureColorExpr,
        'circle-stroke-width': 1,
        'circle-stroke-opacity': expr(['*', 0.7, visibleFactor]),
        'circle-pitch-alignment': 'map',
      },
    },
    {
      id: 'drawing-line-casing',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: libraryFilter(['LineString', 'Polygon'], cased),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': byKind((e) => e.line?.casing, '#ffffff', cased),
        'line-width': zoomScaled(expr(['+', lineWidth, 3]), [[14, 0.4], [18, 1], [21, 1.6]], 2),
        'line-opacity': expr(['*', 0.9, visibleFactor]),
      },
    },
    {
      id: 'drawing-line',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: libraryFilter(['LineString', 'Polygon']),
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': featureColorExpr,
        'line-width': zoomScaled(expr(['case', ['==', ['geometry-type'], 'Polygon'], ['min', lineWidth, 2.5], lineWidth]), [[14, 0.4], [18, 1], [21, 1.6]], 2),
        'line-opacity': expr(['*', lineOpacity, visibleFactor]),
        'line-dasharray': lineDash as never,
      },
    },
    {
      id: 'drawing-point',
      type: 'circle',
      source: FEATURES_SOURCE,
      filter: libraryFilter(['Point'], pointKinds),
      paint: {
        'circle-radius': pointRadius,
        'circle-color': featureColorExpr,
        'circle-opacity': visibleFactor,
        'circle-stroke-color': expr(['case', selected, '#1b1712', '#ffffff']),
        'circle-stroke-width': expr(['case', selected, 2.5, 1.5]),
        'circle-stroke-opacity': visibleFactor,
      },
    },
    {
      id: 'drawing-icon',
      type: 'symbol',
      source: FEATURES_SOURCE,
      minzoom: 15,
      filter: libraryFilter(['Point'], pointKinds),
      layout: {
        'icon-image': expr(['concat', 'drawing-icon-', byKind((e) => e.icon, 'circle-dot', pointKinds)]),
        'icon-size': expr(['interpolate', ['linear'], ['zoom'], 15, 0.3, 17, 0.45, 19, 0.6, 22, 0.75]),
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': visibleFactor },
    },
    {
      id: 'drawing-measure-label',
      type: 'symbol',
      source: FEATURES_SOURCE,
      minzoom: 15,
      filter: ['==', ['get', 'kind'], 'measure'] as FilterSpecification,
      layout: {
        'text-field': measureText(['get', 'length_m'], ['get', 'area_m2']),
        'text-size': 12,
        'text-font': ['Noto Sans Regular'],
        'symbol-placement': 'point',
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#7a3f12', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
  ] as LayerSpecification[]
}

/** "12,4 m" or "48 m²" with French number formatting. */
function measureText(length: unknown, area: unknown): Expr {
  const format = (value: unknown, digits: number) => ['number-format', ['to-number', value, 0], { locale: 'fr-BE', 'max-fraction-digits': digits }]
  return expr(['case',
    ['>', ['to-number', area, 0], 0], ['concat', format(area, 0), ' m²'],
    ['>', ['to-number', length, 0], 0], ['concat', format(length, 1), ' m'],
    ''])
}

// --- Images: icons and fill patterns ----------------------------------------

const PIXEL_RATIO = 2
const imageCache = new Map<string, ImageData>()

function canvas(size: number) {
  const element = document.createElement('canvas')
  element.width = element.height = size * PIXEL_RATIO
  const ctx = element.getContext('2d')!
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO)
  return { element, ctx }
}

function generateImage(id: string): ImageData | null {
  const icon = id.match(/^drawing-icon-([a-z0-9-]+)$/)
  if (icon) {
    const { element, ctx } = canvas(24)
    drawIcon(ctx, icon[1], 0, 0, 24, '#ffffff', 2.25)
    return ctx.getImageData(0, 0, element.width, element.height)
  }
  const pattern = id.match(/^drawing-(hatch|dots)-(#[0-9a-fA-F]{6})$/)
  if (pattern) {
    const size = pattern[1] === 'hatch' ? 10 : 8
    const { element, ctx } = canvas(size)
    ctx.strokeStyle = ctx.fillStyle = pattern[2]
    if (pattern[1] === 'hatch') {
      ctx.lineWidth = 1.4
      ctx.beginPath()
      // Diagonal stripes that tile seamlessly.
      for (const offset of [-size, 0, size]) {
        ctx.moveTo(offset, size)
        ctx.lineTo(offset + size, 0)
      }
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, 1.3, 0, Math.PI * 2)
      ctx.fill()
    }
    return ctx.getImageData(0, 0, element.width, element.height)
  }
  return null
}

function imageFor(id: string): ImageData | null {
  if (!imageCache.has(id)) {
    const image = generateImage(id)
    if (!image) return null
    imageCache.set(id, image)
  }
  return imageCache.get(id)!
}

/**
 * Every image the drawing layers can ask for: the icons of the library and
 * the fill patterns in each colour a patterned element can take (its own
 * and the inspector's swatches). Registered up front rather than through
 * MapLibre's single missing-image resolver, which other modules may need.
 */
const DRAWING_IMAGES = [
  ...ICON_NAMES.map((name) => `drawing-icon-${name}`),
  ...patterned.flatMap((e) => [...new Set([e.color, ...COLOR_SWATCHES])].map((color) => `drawing-${e.fill!.pattern}-${color.toLowerCase()}`)),
]

/**
 * Adds the drawing images (`drawing-icon-<name>`, `drawing-hatch-<#color>`,
 * `drawing-dots-<#color>`) to a map; safe to call again after a style
 * change. The PDF's offscreen map also copies, on demand, the images other
 * modules added to the editor map (`copyFrom`).
 */
export function installDrawingImages(map: MapLibreMap, copyFrom?: MapLibreMap) {
  for (const id of DRAWING_IMAGES) {
    if (map.hasImage(id)) continue
    const image = imageFor(id)
    if (image) map.addImage(id, image, { pixelRatio: PIXEL_RATIO })
  }
  if (copyFrom) {
    map.setMissingStyleImageResolver((id) => {
      const source = copyFrom.hasImage(id) ? copyFrom.getImage(id) : null
      if (source && !map.hasImage(id)) map.addImage(id, source.data, { pixelRatio: source.pixelRatio, sdf: source.sdf })
    })
  }
}

// --- Layers -----------------------------------------------------------------

const wrapped = new WeakMap<MapLibreMap, Set<string>>()

/**
 * The generic feature layers stay for clicks and for non-library kinds; for
 * library kinds they turn transparent with a hit area as large as ours.
 */
function wrapForLibrary(current: unknown, mine: (zoom: number) => unknown, fallback: unknown): unknown {
  const value = current ?? fallback
  if (Array.isArray(value) && (value[0] === 'interpolate' || value[0] === 'step')) {
    const head = value[0] === 'interpolate' ? 3 : 2
    const isZoom = JSON.stringify(value[value[0] === 'interpolate' ? 2 : 1]) === '["zoom"]'
    if (isZoom) {
      const out = value.slice(0, head)
      if (value[0] === 'step') out.push(['case', isLibrary, mine(0), value[2]])
      for (let i = value[0] === 'step' ? 3 : head; i + 1 < value.length; i += 2) {
        out.push(value[i], ['case', isLibrary, mine(Number(value[i])), value[i + 1]])
      }
      return out
    }
  }
  return ['case', isLibrary, mine(18), value]
}

function wrapBaseLayers(map: MapLibreMap) {
  const done = wrapped.get(map) ?? new Set<string>()
  wrapped.set(map, done)
  const radiusAt = (zoom: number) => {
    const stops = POINT_RADIUS
    if (zoom <= stops[0][0]) return stops[0][1] + 2
    for (let i = 1; i < stops.length; i++) {
      if (zoom <= stops[i][0]) {
        const [z0, r0] = stops[i - 1]
        const [z1, r1] = stops[i]
        return r0 + ((r1 - r0) * (zoom - z0)) / (z1 - z0) + 2
      }
    }
    return stops[stops.length - 1][1] + 2
  }
  type PaintProperty = Parameters<MapLibreMap['setPaintProperty']>[1]
  const plan: [string, PaintProperty, (zoom: number) => unknown, unknown][] = [
    ['features-fill', 'fill-opacity', () => 0, 1],
    ['features-line', 'line-opacity', () => 0, 1],
    ['features-line', 'line-width', () => 12, 1],
    ['features-point', 'circle-opacity', () => 0, 1],
    ['features-point', 'circle-stroke-opacity', () => 0, 1],
    ['features-point', 'circle-radius', radiusAt, 5],
  ]
  for (const [layer, property, mine, fallback] of plan) {
    const key = `${layer}:${property}`
    if (done.has(key) || !map.getLayer(layer)) continue
    map.setPaintProperty(layer, property, wrapForLibrary(map.getPaintProperty(layer, property), mine, fallback) as never)
    done.add(key)
  }
}

/** Adds (once) the drawing layers above the generic feature layers. */
export function installDrawingLayers(map: MapLibreMap): boolean {
  if (!map.getSource(FEATURES_SOURCE) || !BASE_LAYERS.every((id) => map.getLayer(id))) return false
  installDrawingImages(map)
  wrapBaseLayers(map)
  if (DRAWING_LAYER_IDS.some((id) => !map.getLayer(id))) {
    const before = map.getLayer(BEFORE_LAYER) ? BEFORE_LAYER : undefined
    for (const layer of drawingLayers(map.getCenter().lat)) {
      if (!map.getLayer(layer.id)) map.addLayer(layer, before)
    }
  }
  return true
}

// --- Visibility of the design layers ("Calques") -----------------------------

const visibilityState = new WeakMap<MapLibreMap, Map<string, { original: unknown; applied: string }>>()

/**
 * Hides the given design layers (`existing`, `water`…) on every map layer
 * drawn from the features source, whoever added it, by combining its own
 * filter with a test on the feature's `layer`. With `scenario: 'current'`,
 * what is still a project (planned plants, drafts) is hidden too.
 */
export function applyLayerVisibility(map: MapLibreMap, hidden: string[], options: { activeOnly?: boolean; scenario?: Scenario } = {}) {
  const store = visibilityState.get(map) ?? new Map<string, { original: unknown; applied: string }>()
  visibilityState.set(map, store)
  const scenario = options.scenario ? scenarioFilter(options.scenario) : null
  const key = `${options.activeOnly ? 'active:' : ''}${scenario ? 'current:' : ''}${[...hidden].sort().join(',')}`
  for (const id of map.getLayersOrder()) {
    if (map.getLayer(id)?.source !== FEATURES_SOURCE) continue
    let entry = store.get(id)
    if (!entry) {
      entry = { original: map.getFilter(id) ?? null, applied: '' }
      store.set(id, entry)
    }
    if (entry.applied === key) continue
    const tests: unknown[] = []
    if (hidden.length) tests.push(['!', ['in', ['get', 'layer'], ['literal', hidden]]])
    // Printed plans leave out drafts (AI proposals) and rejected features.
    if (options.activeOnly) tests.push(['==', ['coalesce', ['get', 'status'], 'active'], 'active'])
    if (scenario) tests.push(scenario)
    const test = tests.length === 0 ? null : tests.length === 1 ? tests[0] : ['all', ...tests]
    const filter = test ? (entry.original ? ['all', entry.original, test] : test) : entry.original
    map.setFilter(id, (filter ?? null) as FilterSpecification | null)
    entry.applied = key
  }
}

// --- Transient overlays: measure in progress, PDF print frame ----------------

function transientSource(map: MapLibreMap, id: string, layers: LayerSpecification[]) {
  if (!map.getSource(id)) {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    layers.forEach((layer) => map.addLayer(layer))
  }
  return map.getSource(id) as GeoJSONSource
}

const MEASURE_COLOR = '#c97b3d'

/** Shows a finished measure (line or area) with its value. */
export function showMeasure(map: MapLibreMap, geometry: Geometry | null, label = '') {
  const id = `${TRANSIENT_PREFIX}measure`
  const source = transientSource(map, id, [
    { id: `${id}-fill`, type: 'fill', source: id, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': MEASURE_COLOR, 'fill-opacity': 0.15 } },
    { id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': MEASURE_COLOR, 'line-width': 2.5, 'line-dasharray': [2, 1] } },
    {
      id: `${id}-label`, type: 'symbol', source: id,
      layout: { 'text-field': ['get', 'label'], 'text-size': 13, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true, 'symbol-placement': 'point' },
      paint: { 'text-color': '#7a3f12', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    },
  ] as LayerSpecification[])
  const features: Feature[] = geometry ? [{ type: 'Feature', geometry, properties: { label } }] : []
  source.setData({ type: 'FeatureCollection', features })
}

/** Outlines the area a PDF export will print. */
export function showPrintFrame(map: MapLibreMap, frame: Polygon | null) {
  const id = `${TRANSIENT_PREFIX}print-frame`
  const source = transientSource(map, id, [
    { id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': MEASURE_COLOR, 'line-width': 2.5, 'line-dasharray': [3, 2] } },
  ] as LayerSpecification[])
  source.setData({ type: 'FeatureCollection', features: frame ? [{ type: 'Feature', geometry: frame, properties: {} }] : [] })
}
