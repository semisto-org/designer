import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { SECTION_COLORS } from './colors.ts'

const SOURCE = 'section-cut'
const LAYERS = ['section-cut-band', 'section-cut-line', 'section-cut-ends'] as const

/**
 * The section's line on the map, with its corridor as a pale band and its
 * two ends lettered A and A′, as on a plan that refers to a section.
 * Installed idempotently; cleared with null.
 */
export function showSectionLine(map: MapLibreMap, line: [number, number][] | null, corridorM = 0, labels: [string, string] = ['A', 'A′']) {
  if (!line) {
    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    return
  }
  const data = {
    type: 'FeatureCollection' as const,
    features: [
      { type: 'Feature' as const, properties: { role: 'line' }, geometry: { type: 'LineString' as const, coordinates: line } },
      { type: 'Feature' as const, properties: { role: 'end', label: labels[0] }, geometry: { type: 'Point' as const, coordinates: line[0] } },
      { type: 'Feature' as const, properties: { role: 'end', label: labels[1] }, geometry: { type: 'Point' as const, coordinates: line[line.length - 1] } },
    ],
  }
  // The corridor (both sides): metres turned into pixels at the line's latitude; the zoom
  // curve stays at the top of the expression, doubling with each zoom level.
  const metresPerPxAtZ0 = 156543.03 * Math.cos((line[0][1] * Math.PI) / 180)
  const widthAt = (zoom: number) => (corridorM * 2 * 2 ** zoom) / metresPerPxAtZ0
  const bandWidth = ['interpolate', ['exponential', 2], ['zoom'], 10, widthAt(10), 24, widthAt(24)]
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    if (map.getLayer('section-cut-band')) map.setPaintProperty('section-cut-band', 'line-width', bandWidth as never)
    return
  }
  map.addSource(SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: 'section-cut-band', type: 'line', source: SOURCE, filter: ['==', ['get', 'role'], 'line'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': SECTION_COLORS.corridor, 'line-opacity': 0.12, 'line-width': bandWidth as never },
  })
  map.addLayer({
    id: 'section-cut-line', type: 'line', source: SOURCE, filter: ['==', ['get', 'role'], 'line'],
    paint: { 'line-color': SECTION_COLORS.line, 'line-width': 2.5, 'line-dasharray': [4, 2] },
  })
  map.addLayer({
    id: 'section-cut-ends', type: 'symbol', source: SOURCE, filter: ['==', ['get', 'role'], 'end'],
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 15, 'text-allow-overlap': true, 'text-offset': [0, -1] },
    paint: { 'text-color': SECTION_COLORS.line, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  })
}
