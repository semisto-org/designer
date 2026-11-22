import type { FeatureCollection, Geometry } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { PLAN_COLORS } from '@/map/plants/strataColors'
import { inkOpacity, paperOpacity } from './fade'

/**
 * The ids of one sheet of tracing paper laid over today's plan: a phase
 * put away (`design-phase`) or another designer's sketch (`variant-compare`).
 */
export function sheetIds(prefix: string) {
  const ids = { source: prefix, paper: `${prefix}-paper`, fill: `${prefix}-fill`, line: `${prefix}-line`, point: `${prefix}-point` }
  return { ...ids, layers: [ids.paper, ids.fill, ids.line, ids.point], hit: [ids.fill, ids.line, ids.point] }
}
export type SheetIds = ReturnType<typeof sheetIds>

const PHASE = sheetIds('design-phase')
export const PHASE_HIT_LAYERS = PHASE.hit

// A phase is drawn like a sheet of tracing paper laid over today's plan:
// plum ink, what was dropped since in red dashes, what moved in ochre.
const INK = '#4a4668' // prune-700
const WASH = '#726b9f' // prune-500
const REMOVED = '#b01a19' // clay-500
const CHANGED = '#a05f00' // humus-600

const stateColor = (fallback: string) => ['match', ['get', 'state'], 'removed', REMOVED, 'changed', CHANGED, fallback]

/** The data each map last received per sheet, so a style event does not resend it. */
const sent = new WeakMap<MapLibreMap, Map<string, FeatureCollection<Geometry>>>()

/**
 * Lays the open phase on the map, above everything else, or takes it away
 * when `data` is null. Idempotent and cheap when nothing changed: called
 * again on every `styledata`, it neither resends the data nor moves a
 * layer already in place (a move is itself a style change).
 */
export function applyPhaseLayers(map: MapLibreMap, data: FeatureCollection<Geometry> | null, fade: number) {
  applySheetLayers(map, PHASE, data, fade)
}

/** From today's plan (0) to the phase alone on its paper (1). */
export function setPhaseFadeOn(map: MapLibreMap, fade: number) {
  setSheetFadeOn(map, PHASE, fade)
}

/**
 * Lays one sheet of tracing paper (`ids`) on the map, above everything
 * else, in `ink` (a phase: plum; a teammate's sketch: its own colour), or
 * takes it away when `data` is null. See applyPhaseLayers.
 */
export function applySheetLayers(map: MapLibreMap, ids: SheetIds, data: FeatureCollection<Geometry> | null, fade: number, ink: { line: string; wash: string } = { line: INK, wash: WASH }) {
  const sentHere = sent.get(map) ?? new Map<string, FeatureCollection<Geometry>>()
  sent.set(map, sentHere)
  if (!data) {
    ids.layers.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id) })
    if (map.getSource(ids.source)) map.removeSource(ids.source)
    sentHere.delete(ids.source)
    return
  }
  const source = map.getSource(ids.source) as GeoJSONSource | undefined
  if (!source) map.addSource(ids.source, { type: 'geojson', data })
  else if (sentHere.get(ids.source) !== data) source.setData(data)
  sentHere.set(ids.source, data)

  const added = !map.getLayer(ids.paper)
  if (added) {
    map.addLayer({ id: ids.paper, type: 'background', paint: { 'background-color': PLAN_COLORS.paper, 'background-opacity': 0 } })
    map.addLayer({
      id: ids.fill, type: 'fill', source: ids.source, filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': stateColor(ink.wash) as never, 'fill-opacity': 0.18 },
    })
    map.addLayer({
      id: ids.line, type: 'line', source: ids.source, filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString', 'MultiLineString']]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': stateColor(ink.line) as never,
        // A freehand stroke stays a stroke: solid, like the pencil drew it.
        'line-width': ['case', ['==', ['get', 'state'], 'same'], ['case', ['==', ['get', 'stroke'], true], 2, 1.4], 2.2],
        'line-dasharray': ['case', ['==', ['get', 'stroke'], true], ['literal', [1, 0]], ['literal', [3, 2]]],
      },
    })
    map.addLayer({
      id: ids.point, type: 'circle', source: ids.source, filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.5, 19, 7],
        'circle-color': PLAN_COLORS.paper,
        'circle-stroke-color': stateColor(ink.line) as never,
        'circle-stroke-width': ['case', ['==', ['get', 'state'], 'same'], 1.4, 2.2],
      },
    })
    setSheetFadeOn(map, ids, fade)
  }
  // Always on top (a sheet is laid over today's plan), moved only when another layer came above.
  const order = map.getLayersOrder()
  if (order.slice(-ids.layers.length).join('|') !== ids.layers.join('|')) ids.layers.forEach((id) => map.moveLayer(id))
}

export function setSheetFadeOn(map: MapLibreMap, ids: SheetIds, fade: number) {
  if (!map.getLayer(ids.paper)) return
  const ink = inkOpacity(fade)
  map.setPaintProperty(ids.paper, 'background-opacity', paperOpacity(fade))
  map.setPaintProperty(ids.fill, 'fill-opacity', Math.round(0.18 * ink * 100) / 100 + 0.06)
  map.setPaintProperty(ids.line, 'line-opacity', ink)
  map.setPaintProperty(ids.point, 'circle-opacity', ink)
  map.setPaintProperty(ids.point, 'circle-stroke-opacity', ink)
}
