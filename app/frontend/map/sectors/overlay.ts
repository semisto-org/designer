import type { Feature, FeatureCollection, LineString, Position } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { destination, packRings, sectorArc } from './sectors.ts'

export const SECTORS_SOURCE = 'sectors-overlay'
const LINE_LAYER = 'sectors-overlay-line'
const LABEL_LAYER = 'sectors-overlay-label'

export type OverlayArc = { key: string; from: number; to: number; color: string; label: string; draft: boolean }

/**
 * The rings of the editor's sector overlay, in metres: the first just
 * outside the terrain, each next one a stroke and a gap further out.
 */
export function overlayRings(baseRadiusM: number) {
  const stroke = Math.max(2, baseRadiusM * 0.11)
  const step = stroke * 1.45
  return { stroke, radius: (ring: number) => baseRadiusM + stroke / 2 + ring * step }
}

/** The arcs around the terrain as the editor draws them, packed in rings like on the dossier page. */
export function overlayData(arcs: OverlayArc[], center: Position, baseRadiusM: number): FeatureCollection<LineString> {
  const rings = packRings(arcs)
  const { radius } = overlayRings(baseRadiusM)
  return {
    type: 'FeatureCollection',
    features: arcs.map((arc, i): Feature<LineString> => ({
      type: 'Feature',
      id: i,
      geometry: sectorArc(center, radius(rings[i]), arc.from, arc.to),
      properties: { key: arc.key, color: arc.color, label: arc.label, draft: arc.draft },
    })),
  }
}

/** West, south, east, north of the overlay, its outermost ring and stroke included. */
export function overlayBounds(arcs: OverlayArc[], center: Position, baseRadiusM: number): [number, number, number, number] {
  const rings = packRings(arcs)
  const { stroke, radius } = overlayRings(baseRadiusM)
  const outer = radius(rings.length ? Math.max(...rings) : 0) + stroke
  const [w] = destination(center, 270, outer)
  const [e] = destination(center, 90, outer)
  const [, s] = destination(center, 180, outer)
  const [, n] = destination(center, 0, outer)
  return [w, s, e, n]
}

/** A width of `meters` on the ground, in pixels at every zoom (MapLibre's 512 px tiles). */
function metersWide(meters: number, latitude: number): unknown {
  const atZoom0 = meters / (78271.517 * Math.cos((latitude * Math.PI) / 180))
  return ['interpolate', ['exponential', 2], ['zoom'], 0, atZoom0, 24, atZoom0 * 2 ** 24]
}

/**
 * Draws (or redraws) the sector overlay: thick translucent arcs with their
 * names written along them in white capitals, as on the dossier page. The
 * strokes keep their width on the ground, so the rings never run into each
 * other whatever the zoom.
 */
export function showSectorOverlay(map: MapLibreMap, arcs: OverlayArc[], center: Position, baseRadiusM: number) {
  const data = overlayData(arcs, center, baseRadiusM)
  const width = metersWide(overlayRings(baseRadiusM).stroke, center[1])
  const source = map.getSource(SECTORS_SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    map.setPaintProperty(LINE_LAYER, 'line-width', width as never)
    return
  }
  map.addSource(SECTORS_SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: LINE_LAYER,
    type: 'line',
    source: SECTORS_SOURCE,
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': width as never,
      'line-opacity': ['case', ['get', 'draft'], 0.55, 0.85],
      'line-dasharray': ['case', ['get', 'draft'], ['literal', [1, 0.4]], ['literal', [1, 0]]] as never,
    },
  })
  map.addLayer({
    id: LABEL_LAYER,
    type: 'symbol',
    source: SECTORS_SOURCE,
    layout: {
      'symbol-placement': 'line-center',
      'text-field': ['get', 'label'],
      'text-transform': 'uppercase',
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 19, 13],
      'text-letter-spacing': 0.2,
      'text-keep-upright': true,
      'text-max-angle': 60,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(27, 23, 18, 0.45)', 'text-halo-width': 1.2 },
  })
}

export function hideSectorOverlay(map: MapLibreMap) {
  for (const id of [LABEL_LAYER, LINE_LAYER]) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(SECTORS_SOURCE)) map.removeSource(SECTORS_SOURCE)
}
