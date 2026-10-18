import type { Geometry, LineString, Polygon, Position } from 'geojson'

/** A point on screen, in pixels. */
export type Pixel = { x: number; y: number }
export type Project = (position: Position) => Pixel

/** How close, in pixels, the pointer must be to a vertex or a side. */
export const VERTEX_TOLERANCE_PX = 12

/** The points a person can add or remove: a line's, or a polygon's outline without its closing copy. */
export function editableVertices(geometry: Geometry): Position[] {
  if (geometry.type === 'LineString') return geometry.coordinates
  if (geometry.type === 'Polygon') return geometry.coordinates[0].slice(0, -1)
  return []
}

/** The vertex under the pointer (the nearest within the tolerance), or -1. */
export function vertexAt(geometry: Geometry, pointer: Pixel, project: Project, tolerance = VERTEX_TOLERANCE_PX): number {
  let best = -1
  let bestDistance = tolerance
  editableVertices(geometry).forEach((position, index) => {
    const d = distance(project(position), pointer)
    if (d <= bestDistance) {
      best = index
      bestDistance = d
    }
  })
  return best
}

/**
 * The side under the pointer, as the index of its first vertex and the
 * point on it nearest the pointer, or null. A polygon's closing side counts.
 */
export function sideAt(geometry: Geometry, pointer: Pixel, project: Project, tolerance = VERTEX_TOLERANCE_PX): { index: number; at: Pixel } | null {
  const vertices = editableVertices(geometry)
  const sides = geometry.type === 'Polygon' ? vertices.length : vertices.length - 1
  let best: { index: number; at: Pixel } | null = null
  let bestDistance = tolerance
  for (let index = 0; index < sides; index++) {
    const a = project(vertices[index])
    const b = project(vertices[(index + 1) % vertices.length])
    const at = nearestOnSegment(a, b, pointer)
    const d = distance(at, pointer)
    if (d <= bestDistance) {
      best = { index, at }
      bestDistance = d
    }
  }
  return best
}

/** The geometry with a new vertex after `index` (on the side that starts there). */
export function insertVertex(geometry: LineString | Polygon, index: number, position: Position): LineString | Polygon {
  const vertices = [...editableVertices(geometry)]
  vertices.splice(index + 1, 0, position)
  return withVertices(geometry, vertices)
}

/** The fewest vertices a shape keeps: two for a line, three for a polygon. */
export const minimumVertices = (geometry: Geometry) => (geometry.type === 'Polygon' ? 3 : 2)

/** The geometry without vertex `index`, or null when the shape would fall below its minimum. */
export function removeVertex(geometry: LineString | Polygon, index: number): LineString | Polygon | null {
  const vertices = editableVertices(geometry)
  if (index < 0 || index >= vertices.length || vertices.length <= minimumVertices(geometry)) return null
  return withVertices(geometry, vertices.filter((_, i) => i !== index))
}

function withVertices(geometry: LineString | Polygon, vertices: Position[]): LineString | Polygon {
  if (geometry.type === 'LineString') return { ...geometry, coordinates: vertices }
  // Holes stay as they are: only the outline is edited.
  return { ...geometry, coordinates: [[...vertices, vertices[0]], ...geometry.coordinates.slice(1)] }
}

function distance(a: Pixel, b: Pixel) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearestOnSegment(a: Pixel, b: Pixel, p: Pixel): Pixel {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length2 = dx * dx + dy * dy
  if (length2 === 0) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2))
  return { x: a.x + t * dx, y: a.y + t * dy }
}
