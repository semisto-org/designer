import type { Geometry } from 'geojson'
import type { LngLat } from '@/types'

/** Middle of a geometry's bounding box: where to put a badge or look at. */
export function geometryCenter(geometry: Geometry): LngLat | null {
  if (geometry.type === 'Point') return geometry.coordinates as LngLat
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.map(geometryCenter).find((c): c is LngLat => c !== null) ?? null
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (node: unknown) => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number') {
      minX = Math.min(minX, node[0]); maxX = Math.max(maxX, node[0])
      minY = Math.min(minY, node[1]); maxY = Math.max(maxY, node[1])
    } else node.forEach(visit)
  }
  visit(geometry.coordinates)
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null
}
