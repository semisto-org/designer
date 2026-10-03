// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The "station" of each square metre, to place species: slope, aspect,
// wetness and frost risk, drawn from the relief alone and the flow axes of
// `hydro.ts`. Wetness and frost are INDICES, not measurements: they say where
// the relief gathers water or cold air, not what the soil really holds. The
// interface presents them as such. No import: it can be exercised alone.

import type { Drainage } from './hydro.ts'

/**
 * Slope (radians) and aspect (radians from north, clockwise: the side the
 * slope goes DOWN to, the one that "looks" at the sky) by Horn's method on
 * the eight neighbours. Edges: the nearest neighbour.
 */
export function slopeAspect(heights: ArrayLike<number>, cols: number, rows: number, cellSize = 1) {
  const slope = new Float32Array(cols * rows)
  const aspect = new Float32Array(cols * rows)
  const at = (c: number, r: number) => heights[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))]
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = at(c - 1, r - 1); const b = at(c, r - 1); const d = at(c + 1, r - 1)
      const e = at(c - 1, r); const f = at(c + 1, r)
      const g = at(c - 1, r + 1); const h = at(c, r + 1); const k = at(c + 1, r + 1)
      // Towards the east and towards the NORTH (rows go south).
      const dzdx = ((d + 2 * f + k) - (a + 2 * e + g)) / (8 * cellSize)
      const dzdy = ((a + 2 * b + d) - (g + 2 * h + k)) / (8 * cellSize)
      const i = r * cols + c
      slope[i] = Math.atan(Math.hypot(dzdx, dzdy))
      // The slope goes down opposite the gradient.
      let direction = Math.atan2(-dzdx, -dzdy)
      if (direction < 0) direction += 2 * Math.PI
      aspect[i] = direction
    }
  }
  return { slope, aspect }
}

/** Separable box blur (radius in cells): 1 m indices are too noisy to read. */
export function boxBlur(values: ArrayLike<number>, cols: number, rows: number, radius: number): Float32Array {
  if (radius < 1) return Float32Array.from(values)
  const tmp = new Float32Array(values.length)
  const out = new Float32Array(values.length)
  for (let r = 0; r < rows; r++) {
    let sum = 0
    let n = 0
    const base = r * cols
    for (let c = 0; c <= Math.min(radius, cols - 1); c++) { sum += values[base + c]; n++ }
    for (let c = 0; c < cols; c++) {
      tmp[base + c] = sum / n
      const add = c + radius + 1
      const drop = c - radius
      if (add < cols) { sum += values[base + add]; n++ }
      if (drop >= 0) { sum -= values[base + drop]; n-- }
    }
  }
  for (let c = 0; c < cols; c++) {
    let sum = 0
    let n = 0
    for (let r = 0; r <= Math.min(radius, rows - 1); r++) { sum += tmp[r * cols + c]; n++ }
    for (let r = 0; r < rows; r++) {
      out[r * cols + c] = sum / n
      const add = r + radius + 1
      const drop = r - radius
      if (add < rows) { sum += tmp[add * cols + c]; n++ }
      if (drop >= 0) { sum -= tmp[drop * cols + c]; n-- }
    }
  }
  return out
}

/**
 * Drained area with SPREAD flow (Quinn et al., 1991): each cell shares its
 * water between all its lower neighbours, in proportion to the slope. Single
 * flow (`analyzeDrainage`) draws the axes well, but at 1 m it empties the
 * slopes: the wetness index needs this diffuse water. On the filled relief,
 * from upstream to downstream.
 */
export function spreadAccumulation(drainage: Pick<Drainage, 'filled' | 'order'>, cols: number, rows: number, cellSize = 1): Float32Array {
  const { filled, order } = drainage
  const n = cols * rows
  const area = cellSize * cellSize
  const accumulation = new Float32Array(n).fill(area)
  const weights = new Float64Array(8)
  const targets = new Int32Array(8)
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k]
    const c = i % cols
    const r = (i - c) / cols
    let total = 0
    let count = 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue
        const j = rr * cols + cc
        const drop = filled[i] - filled[j]
        if (drop <= 0) continue
        const diagonal = dr && dc
        const w = Math.pow(drop / (diagonal ? Math.SQRT2 : 1), 1.1) * (diagonal ? 0.354 : 0.5)
        weights[count] = w
        targets[count] = j
        total += w
        count++
      }
    }
    if (!count) continue
    for (let m = 0; m < count; m++) accumulation[targets[m]] += accumulation[i] * (weights[m] / total)
  }
  return accumulation
}

/**
 * Topographic wetness index (Beven & Kirkby): ln(a / tan β), a = drained area
 * per metre of contour, β = slope. High where much water arrives on a gentle
 * slope (valley bottoms, foot of slopes), low on ridges and steep slopes.
 */
export function wetnessIndex(accumulation: ArrayLike<number>, slope: ArrayLike<number>, cellSize = 1): Float32Array {
  const twi = new Float32Array(accumulation.length)
  for (let i = 0; i < twi.length; i++) {
    const tan = Math.max(Math.tan(slope[i]), 0.001)
    twi[i] = Math.log(accumulation[i] / cellSize / tan)
  }
  return twi
}

/**
 * Frost risk by cold-air pooling, 0 to 1. At night cold air flows like water
 * and stops in the bottoms: we measure each cell's height above the drain its
 * water would reach (HAND, Height Above Nearest Drainage). At 0 m one is in
 * the bottom; at `warmBelt` m and above, on the slope's warm belt. Closed
 * depressions keep their cold-air lake.
 */
export function frostRisk(
  heights: ArrayLike<number>, drainage: Pick<Drainage, 'receiver' | 'order' | 'accumulation' | 'depression'>,
  { channelArea = 50000, warmBelt = 10 }: { channelArea?: number; warmBelt?: number } = {},
): Float32Array {
  const { receiver, order, accumulation, depression } = drainage
  const n = heights.length
  const drainLevel = new Float32Array(n)
  // The flood order goes downstream → upstream: a receiver comes before its donors.
  for (let k = 0; k < n; k++) {
    const i = order[k]
    const to = receiver[i]
    drainLevel[i] = accumulation[i] >= channelArea || to < 0 ? heights[i] : drainLevel[to]
  }
  const risk = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const hand = Math.max(0, heights[i] - drainLevel[i])
    let value = 1 - hand / warmBelt
    if (depression[i] > 0.2) value = Math.max(value, 0.8)
    risk[i] = value < 0 ? 0 : value > 1 ? 1 : value
  }
  return risk
}

export type WetnessClass = 'dry' | 'fresh' | 'moist' | 'wet'
export type FrostClass = 'high' | 'moderate' | 'low'

/**
 * Wetness thresholds calibrated in Claudy on a 1 m DEM with spread flow and a
 * 2 m blur (the summit at 2.7, a 16 % meadow at 5.8, the brook at 14). The
 * published thresholds for 10-30 m DEMs would class 95 % as "dry" at 1 m:
 * coarser grids get them scaled (`thresholdsFor`).
 */
export const WETNESS_THRESHOLDS = [4.5, 6.5, 9] as const

/** TWI grows with ln(cell size): shift the 1 m thresholds accordingly. */
export function wetnessThresholdsFor(cellSize: number): [number, number, number] {
  const shift = Math.log(Math.max(1, cellSize))
  return [WETNESS_THRESHOLDS[0] + shift, WETNESS_THRESHOLDS[1] + shift, WETNESS_THRESHOLDS[2] + shift]
}

export function wetnessClass(twi: number, thresholds: readonly number[] = WETNESS_THRESHOLDS): WetnessClass {
  if (twi < thresholds[0]) return 'dry'
  if (twi < thresholds[1]) return 'fresh'
  if (twi < thresholds[2]) return 'moist'
  return 'wet'
}

export function frostClass(risk: number): FrostClass {
  if (risk >= 0.66) return 'high'
  if (risk >= 0.33) return 'moderate'
  return 'low'
}

const COMPASS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type Compass = typeof COMPASS[number]

/** The eighth of the compass an azimuth (radians from north) points to. */
export function compassPoint(azimuth: number): Compass {
  return COMPASS[Math.round(azimuth / (Math.PI / 4)) % 8]
}
