// Cold air on calm, clear nights. The ground radiates its heat to the sky, the
// air touching it cools, grows denser and slides down the slopes, whatever
// the wind does higher up; it gathers in the bottoms into a layer that
// thickens until dawn and spills over the lowest sill, like water but slower.
//
// Like the frost index of `station.ts`, this is drawn from the relief alone:
// it says where cold air goes and where it lies, not how cold it gets. The
// flow follows the ground PLUS what stands on it (hedges, walls, buildings
// read on the surface model), which dam it or send it round. No three.js,
// no DOM: it can be exercised alone.

import type { Drainage } from './hydro.ts'
import { boxBlur, heightAboveDrain } from './station.ts'

/** The night shown: from 21:00 to 07:00, in minutes after midnight. */
export const NIGHT_START = 21 * 60
export const NIGHT_LENGTH = 10 * 60
/** Thickness (m) the cold layer reaches above the drains at dawn. */
export const LAYER_AT_DAWN = 6
/** What stands at least this high above the ground dams the cold air (m)... */
const OBSTACLE_MIN = 1.5
/** ...counted up to this height: cold air is a few metres thick. */
const OBSTACLE_MAX = 4

export type ColdAirField = {
  cols: number
  rows: number
  cellSize: number
  /** Downhill unit direction of the cold air, east (x) and south (z). */
  dirX: Float32Array
  dirZ: Float32Array
  /** Slope of the smoothed surface the air slides on (tangent). */
  slope: Float32Array
  /** Height above the drain the cell's air reaches (m). */
  hand: Float32Array
  /** Depth of the closed hollow the cell sits in (m), 0 outside. */
  depression: Float32Array
}

/**
 * The ground the cold air slides on: the relief, raised where a hedge, a
 * wall or a building stands (surface model minus ground), capped at a few
 * metres.
 */
export function coldAirGround(ground: ArrayLike<number>, surface: ArrayLike<number> | null): Float32Array {
  const out = Float32Array.from(ground)
  if (!surface) return out
  for (let i = 0; i < out.length; i++) {
    const rise = surface[i] - ground[i]
    if (rise >= OBSTACLE_MIN && rise < 60) out[i] += Math.min(rise, OBSTACLE_MAX)
  }
  return out
}

export function coldAirField(
  ground: ArrayLike<number>, surface: ArrayLike<number> | null, drainage: Pick<Drainage, 'receiver' | 'order' | 'accumulation' | 'depression'>,
  cols: number, rows: number, cellSize: number,
): ColdAirField {
  const n = cols * rows
  // Smoothed over a few metres: the air does not see every furrow.
  const radius = Math.max(1, Math.round(3 / cellSize))
  const bed = boxBlur(coldAirGround(ground, surface), cols, rows, radius)
  const dirX = new Float32Array(n)
  const dirZ = new Float32Array(n)
  const slope = new Float32Array(n)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const west = bed[r * cols + Math.max(0, c - 1)]
      const east = bed[r * cols + Math.min(cols - 1, c + 1)]
      const north = bed[Math.max(0, r - 1) * cols + c]
      const south = bed[Math.min(rows - 1, r + 1) * cols + c]
      const spanX = (Math.min(cols - 1, c + 1) - Math.max(0, c - 1)) * cellSize || 1
      const spanZ = (Math.min(rows - 1, r + 1) - Math.max(0, r - 1)) * cellSize || 1
      const gx = (east - west) / spanX
      const gz = (south - north) / spanZ
      const length = Math.hypot(gx, gz)
      slope[i] = length
      if (length > 1e-6) {
        dirX[i] = -gx / length
        dirZ[i] = -gz / length
      }
    }
  }
  return { cols, rows, cellSize, dirX, dirZ, slope, hand: heightAboveDrain(ground, drainage), depression: Float32Array.from(drainage.depression) }
}

/**
 * Thickness of the cold layer (m) in each cell at `night` (0 at 21:00, 1 at
 * dawn): it rises fast in the evening, then slower (square root of time),
 * from the drains up the slopes; closed hollows fill first.
 */
export function coldLayer(field: Pick<ColdAirField, 'hand' | 'depression'>, night: number, out?: Float32Array): Float32Array {
  const { hand, depression } = field
  const depth = out ?? new Float32Array(hand.length)
  const t = Math.min(1, Math.max(0, night))
  const layer = LAYER_AT_DAWN * Math.sqrt(t)
  const hollow = Math.min(1, t * 1.5)
  for (let i = 0; i < depth.length; i++) {
    depth[i] = Math.max(0, layer - hand[i], depression[i] * hollow)
  }
  return depth
}

/** The clock time (minutes after midnight) of a point of the night. */
export function nightClock(night: number): number {
  return Math.round(NIGHT_START + Math.min(1, Math.max(0, night)) * NIGHT_LENGTH) % (24 * 60)
}
