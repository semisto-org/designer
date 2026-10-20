import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

export const ZONES_SOURCE = 'permaculture-zones'
const FILL_LAYER = 'permaculture-zones-fill'
const LINE_LAYER = 'permaculture-zones-line'
const LABEL_LAYER = 'permaculture-zones-label'

export type OverlayZone = { key: string; number: number; color: string; label: string; geometry: Polygon | MultiPolygon; proposed: boolean; selected: boolean }

/**
 * Draws (or redraws) the permaculture zones under the other features, like
 * watercolour washes: the house warm, the wild deep green, each zone's
 * number written across it. A proposal not yet placed is dashed. Lies below
 * the sector rings, so the two read together.
 */
export function showZonesOverlay(map: MapLibreMap, zones: OverlayZone[]) {
  const data: FeatureCollection = {
    type: 'FeatureCollection',
    // Outer zones first, so the inner ones are painted over them where they overlap.
    features: [...zones].sort((a, b) => b.number - a.number).map((z) => ({
      type: 'Feature',
      geometry: z.geometry,
      properties: { key: z.key, color: z.color, label: z.label, proposed: z.proposed, selected: z.selected },
    })),
  }
  const source = map.getSource(ZONES_SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  // Under the drawn features, so trees, paths and ponds stay on top.
  const before = map.getLayer('features-fill') ? 'features-fill' : undefined
  map.addSource(ZONES_SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: FILL_LAYER,
    type: 'fill',
    source: ZONES_SOURCE,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'proposed'], 0.18, 0.3] },
  }, before)
  map.addLayer({
    id: LINE_LAYER,
    type: 'line',
    source: ZONES_SOURCE,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['get', 'selected'], 4, 2],
      'line-dasharray': ['case', ['get', 'proposed'], ['literal', [2, 1.5]], ['literal', [1, 0]]] as never,
    },
  }, before)
  map.addLayer({
    id: LABEL_LAYER,
    type: 'symbol',
    source: ZONES_SOURCE,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 15, 12, 19, 16],
      'text-letter-spacing': 0.08,
      'symbol-placement': 'point',
      'text-allow-overlap': false,
    },
    paint: { 'text-color': '#1b1712', 'text-halo-color': 'rgba(255, 255, 255, 0.85)', 'text-halo-width': 1.6 },
  })
}

export function hideZonesOverlay(map: MapLibreMap) {
  for (const id of [LABEL_LAYER, LINE_LAYER, FILL_LAYER]) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(ZONES_SOURCE)) map.removeSource(ZONES_SOURCE)
}
