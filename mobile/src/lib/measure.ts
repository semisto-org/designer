// « Mesurer »: points tapped on the map or taken where one stands, read as
// a line (a hedge, a swale) or a closed surface (a bed, a meadow), with the
// length of each side written on the map. Pure logic, unit-tested.
import { distance, lineLength, ringArea } from './geo'
import type { Geometry, Position } from './types'

export type MeasureShape = 'LineString' | 'Polygon'

export type Measure = { length: number; perimeter: number | null; area: number | null }

/** A surface needs three points; a line, two. */
export function canClose(points: Position[]): boolean {
  return points.length >= 3
}

export function measureOf(points: Position[]): Measure {
  const closed = canClose(points)
  return {
    length: lineLength(points),
    perimeter: closed ? lineLength([...points, points[0]]) : null,
    area: closed ? ringArea([...points, points[0]]) : null,
  }
}

/** The element the measure becomes, or null while it has too few points. */
export function measureGeometry(points: Position[], shape: MeasureShape): Geometry | null {
  if (shape === 'Polygon') return canClose(points) ? { type: 'Polygon', coordinates: [[...points, points[0]]] } : null
  return points.length >= 2 ? { type: 'LineString', coordinates: points } : null
}

/** One label per side, at its middle (the closing side too for a surface), sides under 1 m left out. */
export function sideLabels(points: Position[], shape: MeasureShape, format: (meters: number) => string): GeoJSON.FeatureCollection {
  const ends = shape === 'Polygon' && canClose(points) ? [...points, points[0]] : points
  const features: GeoJSON.Feature[] = []
  for (let i = 1; i < ends.length; i++) {
    const meters = distance(ends[i - 1], ends[i])
    if (meters < 1) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [(ends[i - 1][0] + ends[i][0]) / 2, (ends[i - 1][1] + ends[i][1]) / 2] },
      properties: { label: format(meters) },
    })
  }
  return { type: 'FeatureCollection', features }
}

/** Points kept in the record screen's URL: a few decimals is a centimeter. */
export function encodePoints(points: Position[]): string {
  return points.map(([lng, lat]) => `${lng.toFixed(7)},${lat.toFixed(7)}`).join(';')
}

export function decodePoints(text: string | undefined): Position[] {
  if (!text) return []
  return text.split(';').flatMap((pair) => {
    const [lng, lat] = pair.split(',').map(Number)
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [[lng, lat] as Position] : []
  })
}
