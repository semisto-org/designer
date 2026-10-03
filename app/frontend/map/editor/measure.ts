import { area as turfArea, length as turfLength } from '@turf/turf'
import type { Geometry } from 'geojson'

/** Area (m²) for polygons, length (m) for lines and polygon perimeters. */
export function measure(geometry: Geometry): { area: number | null; length: number | null } {
  const feature = { type: 'Feature' as const, geometry, properties: {} }
  switch (geometry.type) {
    case 'Polygon':
    case 'MultiPolygon': {
      const rings = geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0])
      const perimeter = rings.reduce(
        (sum, ring) => sum + turfLength({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring }, properties: {} }, { units: 'meters' }),
        0,
      )
      return { area: turfArea(feature), length: perimeter }
    }
    case 'LineString':
    case 'MultiLineString':
      return { area: null, length: turfLength(feature, { units: 'meters' }) }
    default:
      return { area: null, length: null }
  }
}
