// Small geodesy for the terrain (WGS84 degrees in, meters out). Pure.
import type { Geometry, Position } from './types'

const R = 6371008.8
const rad = (deg: number) => (deg * Math.PI) / 180

export function distance(a: Position, b: Position): number {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Compass bearing from a to b, 0 = north, clockwise, in degrees. */
export function bearing(a: Position, b: Position): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function lineLength(points: Position[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i])
  return total
}

/** [west, south, east, north] grown by `meters` on each side. */
export function expandBbox([w, s, e, n]: [number, number, number, number], meters: number): [number, number, number, number] {
  const dLat = meters / 111_320
  const dLng = meters / (111_320 * Math.cos(rad((s + n) / 2)))
  return [w - dLng, s - dLat, e + dLng, n + dLat]
}

/** A point that stands for the geometry: the point itself, else the mean of its vertices. */
export function anchor(geometry: Geometry): Position {
  if (geometry.type === 'Point') return geometry.coordinates
  const flat = (geometry.coordinates as unknown[]).flat(3) as number[]
  let x = 0
  let y = 0
  for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1] }
  const n = flat.length / 2
  return [x / n, y / n]
}

/**
 * Cleans a walked GPS trace: drops fixes less accurate than `maxAccuracy`
 * meters and points closer than `minStep` meters to the previous kept one.
 */
export function cleanTrace(fixes: { position: Position; accuracy: number | null }[], { maxAccuracy = 15, minStep = 2 } = {}): Position[] {
  const kept: Position[] = []
  for (const fix of fixes) {
    if (fix.accuracy !== null && fix.accuracy > maxAccuracy) continue
    if (kept.length && distance(kept[kept.length - 1], fix.position) < minStep) continue
    kept.push(fix.position)
  }
  return kept
}

/** Area of a ring in square meters (spherical excess, good at terrain scale). */
export function ringArea(ring: Position[]): number {
  if (ring.length < 3) return 0
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    total += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)))
  }
  return Math.abs((total * R * R) / 2)
}
