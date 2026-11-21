import { booleanPointInPolygon, centroid } from '@turf/turf'
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson'
import { sheetOf } from './sheets'

type Item = { type: 'Feature'; geometry: Geometry; properties: { id: number; layer: string; kind: string; status?: string; name?: string | null } & Record<string, unknown> }

/** A point that stands for an element: itself, the middle of a line, the centre of a surface. */
export function anchorOf(geometry: Geometry): Position | null {
  switch (geometry.type) {
    case 'Point':
      return geometry.coordinates
    case 'LineString':
      return geometry.coordinates[Math.floor(geometry.coordinates.length / 2)] ?? null
    case 'MultiLineString': {
      const line = geometry.coordinates[0] ?? []
      return line[Math.floor(line.length / 2)] ?? null
    }
    case 'Polygon':
    case 'MultiPolygon':
      return centroid(geometry).geometry.coordinates
    default:
      return null
  }
}

/**
 * The elements of the frame and the planting that a bubble's outline
 * holds: what the intention has become in the design so far.
 */
export function insideBubble<T extends Item>(bubble: { geometry: Geometry }, features: T[]): T[] {
  if (bubble.geometry.type !== 'Polygon' && bubble.geometry.type !== 'MultiPolygon') return []
  const shape = { type: 'Feature', geometry: bubble.geometry, properties: {} } as Feature<Polygon | MultiPolygon>
  return features.filter((f) => {
    if (f.properties.status === 'rejected') return false
    const sheet = sheetOf(f.properties)
    if (sheet !== 'frame' && sheet !== 'planting') return false
    const anchor = anchorOf(f.geometry)
    return anchor != null && booleanPointInPolygon(anchor, shape)
  })
}
