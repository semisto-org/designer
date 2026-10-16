// « Pendant l'averse »: marks drawn with a finger on the map while it rains
// (where water runs, stands or comes out of the ground), turned into the
// map's `storm_observation` elements. Pure logic, unit-tested.
import type { Geometry, Position } from './types'

export type StormWater = 'flows' | 'pools' | 'seeps'
export type Rain = 'drizzle' | 'steady' | 'heavy' | 'storm'
export const RAINS: Rain[] = ['drizzle', 'steady', 'heavy', 'storm']

export type StormMark = { id: number; water: StormWater; coordinates: Position[] }

type Pixel = { x: number; y: number }

/** Finger points closer than `minPx` to the last kept one are dropped. */
export function thinStroke(points: Pixel[], minPx = 6): Pixel[] {
  const kept: Pixel[] = []
  for (const point of points) {
    const last = kept[kept.length - 1]
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= minPx) kept.push(point)
  }
  const end = points[points.length - 1]
  if (end && kept.length > 0 && kept[kept.length - 1] !== end && points.length > 1) kept.push(end)
  return kept
}

/** The element of a mark, or null when the stroke is too short for its shape. */
export function markGeometry(mark: StormMark): Geometry | null {
  const c = mark.coordinates
  if (mark.water === 'seeps') return c.length > 0 ? { type: 'Point', coordinates: c[c.length - 1] } : null
  if (mark.water === 'flows') return c.length >= 2 ? { type: 'LineString', coordinates: c } : null
  return c.length >= 3 ? { type: 'Polygon', coordinates: [[...c, c[0]]] } : null
}

export type StormDetails = { rain: Rain | null; rainMm: string; muddy: boolean; observedAt: string }

/** The properties stored on each element of one downpour. */
export function stormProperties(details: StormDetails): Record<string, unknown> {
  const mm = Number(details.rainMm.replace(',', '.'))
  return {
    observed_at: details.observedAt,
    ...(details.rain ? { rain: details.rain } : {}),
    ...(details.rainMm.trim() && Number.isFinite(mm) && mm >= 0 && mm <= 300 ? { rain_mm: Math.round(mm * 2) / 2 } : {}),
    ...(details.muddy ? { muddy: true } : {}),
  }
}
