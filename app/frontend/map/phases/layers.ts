import type { FeatureCollection, Geometry } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { PLAN_COLORS } from '@/map/plants/strataColors'
import { inkOpacity, paperOpacity } from './fade'

export const PHASE_SOURCE = 'design-phase'
export const PHASE_PAPER = 'design-phase-paper'
export const PHASE_FILL = 'design-phase-fill'
export const PHASE_LINE = 'design-phase-line'
export const PHASE_POINT = 'design-phase-point'
export const PHASE_LAYERS = [PHASE_PAPER, PHASE_FILL, PHASE_LINE, PHASE_POINT]
export const PHASE_HIT_LAYERS = [PHASE_FILL, PHASE_LINE, PHASE_POINT]

// A phase is drawn like a sheet of tracing paper laid over today's plan:
// plum ink, what was dropped since in red dashes, what moved in ochre.
const INK = '#4a4668' // prune-700
const WASH = '#726b9f' // prune-500
const REMOVED = '#b01a19' // clay-500
const CHANGED = '#a05f00' // humus-600

const stateColor = (fallback: string) => ['match', ['get', 'state'], 'removed', REMOVED, 'changed', CHANGED, fallback]

/** The data each map last received, so a style event does not resend it. */
const sent = new WeakMap<MapLibreMap, FeatureCollection<Geometry>>()

/**
 * Lays the open phase on the map, above everything else, or takes it away
 * when `data` is null. Idempotent and cheap when nothing changed: called
 * again on every `styledata`, it neither resends the data nor moves a
 * layer already in place (a move is itself a style change).
 */
export function applyPhaseLayers(map: MapLibreMap, data: FeatureCollection<Geometry> | null, fade: number) {
  if (!data) {
    PHASE_LAYERS.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id) })
    if (map.getSource(PHASE_SOURCE)) map.removeSource(PHASE_SOURCE)
    sent.delete(map)
    return
  }
  const source = map.getSource(PHASE_SOURCE) as GeoJSONSource | undefined
  if (!source) map.addSource(PHASE_SOURCE, { type: 'geojson', data })
  else if (sent.get(map) !== data) source.setData(data)
  sent.set(map, data)

  const added = !map.getLayer(PHASE_PAPER)
  if (added) {
    map.addLayer({ id: PHASE_PAPER, type: 'background', paint: { 'background-color': PLAN_COLORS.paper, 'background-opacity': 0 } })
    map.addLayer({
      id: PHASE_FILL, type: 'fill', source: PHASE_SOURCE, filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': stateColor(WASH) as never, 'fill-opacity': 0.18 },
    })
    map.addLayer({
      id: PHASE_LINE, type: 'line', source: PHASE_SOURCE, filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': stateColor(INK) as never,
        'line-width': ['case', ['==', ['get', 'state'], 'same'], 1.4, 2.2],
        'line-dasharray': [3, 2],
      },
    })
    map.addLayer({
      id: PHASE_POINT, type: 'circle', source: PHASE_SOURCE, filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.5, 19, 7],
        'circle-color': PLAN_COLORS.paper,
        'circle-stroke-color': stateColor(INK) as never,
        'circle-stroke-width': ['case', ['==', ['get', 'state'], 'same'], 1.4, 2.2],
      },
    })
    setPhaseFadeOn(map, fade)
  }
  // Always on top (a phase is laid over today's plan), moved only when another layer came above.
  const order = map.getLayersOrder()
  if (order.slice(-PHASE_LAYERS.length).join('|') !== PHASE_LAYERS.join('|')) PHASE_LAYERS.forEach((id) => map.moveLayer(id))
}

/** From today's plan (0) to the phase alone on its paper (1). */
export function setPhaseFadeOn(map: MapLibreMap, fade: number) {
  if (!map.getLayer(PHASE_PAPER)) return
  const ink = inkOpacity(fade)
  map.setPaintProperty(PHASE_PAPER, 'background-opacity', paperOpacity(fade))
  map.setPaintProperty(PHASE_FILL, 'fill-opacity', Math.round(0.18 * ink * 100) / 100 + 0.06)
  map.setPaintProperty(PHASE_LINE, 'line-opacity', ink)
  map.setPaintProperty(PHASE_POINT, 'circle-opacity', ink)
  map.setPaintProperty(PHASE_POINT, 'circle-stroke-opacity', ink)
}
