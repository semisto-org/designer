// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The hydrology of the relief, with no dependency (neither three.js nor the
// DOM) so it can be exercised alone:
//
// - `analyzeDrainage`: the flow axes. A priority-flood (Barnes, Lehman &
//   Mulla 2014) fills the depressions from the borders, and each cell drains
//   to the cell that reached it. It gives the area drained by each cell (where
//   water gathers) and the depth of the depressions (where it ponds).
// - `RainSimulation`: rain running off the relief with the "virtual pipes"
//   model (O'Brien & Hodgins 1995, Mei et al. 2007): a water depth per cell,
//   flows to the four neighbours pushed by the difference of water level,
//   slowed by friction. Water leaves the grid at its borders; the balance
//   (rain − infiltration − outflow = water present) holds at every step.

const GRAVITY = 9.81

/** Grid encoding of the heights (see Relief::Raster on the server). */
export type GridEncoding = {
  cols: number
  rows: number
  zMin: number
  zUnit: number
  nodata: number
}

/**
 * Decodes a Uint16 grid (units of `zUnit` above `zMin`, `nodata` = no data)
 * into heights in metres. A hole takes the mean of its known neighbours,
 * swept until none remains (the SPW leaves holes only on open water or tile
 * edges); an isolated remainder takes `zMin`.
 */
export function decodeGrid(buffer: ArrayBuffer, meta: GridEncoding): Float32Array {
  const raw = new Uint16Array(buffer)
  const { cols, rows } = meta
  const zMin = Number(meta.zMin)
  const unit = Number(meta.zUnit || 0.01)
  const nodata = meta.nodata ?? 65535
  if (raw.length !== cols * rows) throw new Error(`grid of ${raw.length} values for ${cols} × ${rows}`)

  const heights = new Float32Array(raw.length)
  const missing: number[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === nodata) {
      heights[i] = NaN
      missing.push(i)
    } else {
      heights[i] = zMin + raw[i] * unit
    }
  }
  let pending = missing
  while (pending.length) {
    const still: number[] = []
    for (const i of pending) {
      const c = i % cols
      const r = (i - c) / cols
      let sum = 0
      let n = 0
      for (const [dc, dr] of FOUR) {
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue
        const v = heights[rr * cols + cc]
        if (!Number.isNaN(v)) { sum += v; n++ }
      }
      if (n) heights[i] = sum / n
      else still.push(i)
    }
    if (still.length === pending.length) {
      still.forEach((i) => { heights[i] = zMin })
      break
    }
    pending = still
  }
  return heights
}

export type Downsampled = { heights: Float32Array; cols: number; rows: number }

/** Block mean `factor × factor`: the simulation grid from the relief grid. */
export function downsample(heights: ArrayLike<number>, cols: number, rows: number, factor: number): Downsampled {
  if (factor <= 1) return { heights: Float32Array.from(heights), cols, rows }
  const outCols = Math.floor(cols / factor)
  const outRows = Math.floor(rows / factor)
  const out = new Float32Array(outCols * outRows)
  const area = factor * factor
  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      let sum = 0
      for (let dr = 0; dr < factor; dr++) {
        const base = (r * factor + dr) * cols + c * factor
        for (let dc = 0; dc < factor; dc++) sum += heights[base + dc]
      }
      out[r * outCols + c] = sum / area
    }
  }
  return { heights: out, cols: outCols, rows: outRows }
}

/**
 * A minimal binary heap of cell indices keyed by Float64: the priority-flood
 * pops every cell of the grid, a sorted array would be quadratic.
 */
export class MinHeap {
  keys: Float64Array
  items: Int32Array
  size = 0

  constructor(capacity: number) {
    this.keys = new Float64Array(capacity)
    this.items = new Int32Array(capacity)
  }

  push(item: number, key: number) {
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent] <= key) break
      this.keys[i] = this.keys[parent]
      this.items[i] = this.items[parent]
      i = parent
    }
    this.keys[i] = key
    this.items[i] = item
  }

  pop(): number {
    const top = this.items[0]
    const last = --this.size
    if (last > 0) {
      const key = this.keys[last]
      const item = this.items[last]
      let i = 0
      for (;;) {
        let child = 2 * i + 1
        if (child >= last) break
        if (child + 1 < last && this.keys[child + 1] < this.keys[child]) child++
        if (this.keys[child] >= key) break
        this.keys[i] = this.keys[child]
        this.items[i] = this.items[child]
        i = child
      }
      this.keys[i] = key
      this.items[i] = item
    }
    return top
  }
}

const FOUR: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const EIGHT: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

export type Drainage = {
  /** m² drained by each cell (single flow direction). */
  accumulation: Float32Array
  /** Depth of the depression each cell sits in (m), 0 outside. */
  depression: Float32Array
  /** Downstream cell, -1 on the borders. */
  receiver: Int32Array
  /** Cells from downstream to upstream: each receiver before its donors. */
  order: Int32Array
  /** The relief with its depressions filled. */
  filled: Float64Array
}

/**
 * Flow axes and depressions. The flood starts from the borders (water leaves
 * the grid there) and always advances through the lowest cell reached; each
 * discovered cell drains to the cell that discovered it, and its filled level
 * never goes below its downstream's (+ an epsilon that keeps a slope on
 * flats). The heap pops from downstream to upstream: walking it backwards
 * accumulates the drained areas in a single pass.
 */
export function analyzeDrainage(heights: ArrayLike<number>, cols: number, rows: number, cellSize = 1): Drainage {
  const n = cols * rows
  const filled = new Float64Array(n)
  const receiver = new Int32Array(n).fill(-1)
  const seen = new Uint8Array(n)
  const order = new Int32Array(n)
  const heap = new MinHeap(n)
  const epsilon = 1e-5

  const seed = (i: number) => {
    if (seen[i]) return
    seen[i] = 1
    filled[i] = heights[i]
    heap.push(i, heights[i])
  }
  for (let c = 0; c < cols; c++) { seed(c); seed((rows - 1) * cols + c) }
  for (let r = 1; r < rows - 1; r++) { seed(r * cols); seed(r * cols + cols - 1) }

  let count = 0
  while (heap.size) {
    const i = heap.pop()
    order[count++] = i
    const c = i % cols
    const r = (i - c) / cols
    for (const [dc, dr] of EIGHT) {
      const cc = c + dc
      const rr = r + dr
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue
      const j = rr * cols + cc
      if (seen[j]) continue
      seen[j] = 1
      receiver[j] = i
      filled[j] = Math.max(heights[j], filled[i] + epsilon)
      heap.push(j, filled[j])
    }
  }

  const cellArea = cellSize * cellSize
  const accumulation = new Float32Array(n).fill(cellArea)
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k]
    const to = receiver[i]
    if (to >= 0) accumulation[to] += accumulation[i]
  }

  const depression = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const depth = filled[i] - heights[i]
    depression[i] = depth > 0.01 ? depth : 0
  }

  return { accumulation, depression, receiver, order, filled }
}

export type RainOptions = {
  /** mm/h of a constant storm. */
  intensity: number
  /** Uniform infiltration (mm/h) when there is no `infiltrationMap`. */
  infiltration: number
  /** Storm duration in minutes, 0 = endless. */
  duration: number
  /** Fraction of flow lost per second. */
  friction: number
  /** mm/h per cell (from the land cover). */
  infiltrationMap: Float32Array | null
  /** Soil reserve per cell (mm): once full, only percolation passes. */
  storageMap: Float32Array | null
  /** 0..1: how full the soil reserve is at the start. */
  initialFill: number
  /** mm/h that leaves a full reserve (and empties it between storms). */
  percolation: number
  /** A measured rain (mm/h, hour by hour), replacing the constant storm. */
  series: number[] | null
}

export const DEFAULT_RAIN: RainOptions = {
  intensity: 30, infiltration: 5, duration: 60, friction: 0.5, infiltrationMap: null,
  storageMap: null, initialFill: 0.5, percolation: 0.5, series: null,
}

/**
 * Rain on the relief, step by step. `heights`: the terrain (m), `cellSize`:
 * a cell's side (m). Options change on the fly (`setOptions`).
 */
export class RainSimulation {
  ground: Float32Array
  cols: number
  rows: number
  cellSize: number
  /** Water depth per cell (m). */
  depth: Float32Array
  /** Outflows to the right, left, bottom (south) and top (north), m³/s. */
  fluxR: Float32Array
  fluxL: Float32Array
  fluxB: Float32Array
  fluxT: Float32Array
  /** Mean water velocity per cell (m/s), for the tracers. */
  velX: Float32Array
  velY: Float32Array
  /** Water already held by the soil of each cell (m). */
  soil: Float32Array
  options: RainOptions
  time = 0
  rained = 0
  infiltrated = 0
  outflow = 0

  constructor(heights: ArrayLike<number>, cols: number, rows: number, cellSize: number, options: Partial<RainOptions> = {}) {
    this.ground = Float32Array.from(heights)
    this.cols = cols
    this.rows = rows
    this.cellSize = cellSize
    const n = cols * rows
    this.depth = new Float32Array(n)
    this.fluxR = new Float32Array(n)
    this.fluxL = new Float32Array(n)
    this.fluxB = new Float32Array(n)
    this.fluxT = new Float32Array(n)
    this.velX = new Float32Array(n)
    this.velY = new Float32Array(n)
    this.soil = new Float32Array(n)
    this.options = { ...DEFAULT_RAIN }
    this.setOptions(options)
    this.reset()
  }

  setOptions(options: Partial<RainOptions>) {
    Object.assign(this.options, options)
  }

  reset() {
    this.depth.fill(0)
    this.fluxR.fill(0)
    this.fluxL.fill(0)
    this.fluxB.fill(0)
    this.fluxT.fill(0)
    this.velX.fill(0)
    this.velY.fill(0)
    this.fillSoil()
    this.time = 0
    this.rained = 0
    this.infiltrated = 0
    this.outflow = 0
  }

  /** The soil at the start: filled at `initialFill` of its reserve. */
  fillSoil() {
    const storage = this.options.storageMap
    if (!storage) { this.soil.fill(0); return }
    const fill = this.options.initialFill ?? 0.5
    for (let i = 0; i < this.soil.length; i++) this.soil[i] = (storage[i] / 1000) * fill
  }

  get raining(): boolean {
    if (this.options.series) return this.time < this.options.series.length * 3600
    const minutes = this.options.duration
    return !(minutes > 0) || this.time < minutes * 60
  }

  /** The current rain intensity (mm/h). */
  get intensity(): number {
    if (!this.raining) return 0
    const { series } = this.options
    return series ? series[Math.floor(this.time / 3600)] || 0 : this.options.intensity
  }

  /** Water present on the grid (m³). */
  stored(): number {
    let sum = 0
    for (let i = 0; i < this.depth.length; i++) sum += this.depth[i]
    return sum * this.cellSize * this.cellSize
  }

  /**
   * One step of `dt` seconds. Beyond ~1 s on a 2 m cell the model
   * oscillates: callers chain small steps rather than a large one.
   */
  step(dt: number) {
    const { cols, rows, cellSize, ground, depth, fluxR, fluxL, fluxB, fluxT } = this
    const n = cols * rows
    const area = cellSize * cellSize
    const rain = (this.intensity / 1000 / 3600) * dt
    const map = this.options.infiltrationMap
    const storage = this.options.storageMap
    const soil = this.soil
    const toDepth = dt / 1000 / 3600
    const infiltrationUniform = this.options.infiltration * toDepth
    const percolation = (this.options.percolation ?? 0.5) * toDepth
    // Friction damps the flows by a fraction per second: without it water
    // would accelerate forever down the slope.
    const keep = Math.max(0, 1 - this.options.friction * dt)
    const pipe = dt * GRAVITY * cellSize

    // 1. The rain falls, the soil drinks a part of it.
    let rainedStep = 0
    let infiltratedStep = 0
    for (let i = 0; i < n; i++) {
      let d = depth[i] + rain
      rainedStep += rain
      let infiltration = map ? map[i] * toDepth : infiltrationUniform
      if (storage) {
        // Full reserve: only percolation passes. It also drains the soil.
        const room = storage[i] / 1000 - soil[i]
        if (room <= 0) infiltration = Math.min(infiltration, percolation)
        else if (infiltration > room + percolation) infiltration = room + percolation
      }
      const soaked = d < infiltration ? d : infiltration
      if (storage) {
        const after = soil[i] + soaked - percolation
        soil[i] = after > 0 ? after : 0
      }
      d -= soaked
      infiltratedStep += soaked
      depth[i] = d
    }

    // 2. Flows to the neighbours follow the water level difference. At the
    //    border, the missing neighbour is dry ground: the water leaves.
    let outflowStep = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const d = depth[i]
        const level = ground[i] + d
        const right = c + 1 < cols ? ground[i + 1] + depth[i + 1] : ground[i]
        const left = c > 0 ? ground[i - 1] + depth[i - 1] : ground[i]
        const bottom = r + 1 < rows ? ground[i + cols] + depth[i + cols] : ground[i]
        const top = r > 0 ? ground[i - cols] + depth[i - cols] : ground[i]
        let fR = fluxR[i] * keep + pipe * (level - right)
        let fL = fluxL[i] * keep + pipe * (level - left)
        let fB = fluxB[i] * keep + pipe * (level - bottom)
        let fT = fluxT[i] * keep + pipe * (level - top)
        if (fR < 0) fR = 0
        if (fL < 0) fL = 0
        if (fB < 0) fB = 0
        if (fT < 0) fT = 0
        const total = (fR + fL + fB + fT) * dt
        const available = d * area
        // Never more water out than there is: scale all flows of the cell.
        if (total > available) {
          const k = total > 0 ? available / total : 0
          fR *= k; fL *= k; fB *= k; fT *= k
        }
        fluxR[i] = fR
        fluxL[i] = fL
        fluxB[i] = fB
        fluxT[i] = fT
        if (c + 1 === cols) outflowStep += fR * dt
        if (c === 0) outflowStep += fL * dt
        if (r + 1 === rows) outflowStep += fB * dt
        if (r === 0) outflowStep += fT * dt
      }
    }

    // 3. Each cell receives what its neighbours send and loses what it sends.
    const { velX, velY } = this
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const inR = c > 0 ? fluxR[i - 1] : 0
        const inL = c + 1 < cols ? fluxL[i + 1] : 0
        const inB = r > 0 ? fluxB[i - cols] : 0
        const inT = r + 1 < rows ? fluxT[i + cols] : 0
        const out = fluxR[i] + fluxL[i] + fluxB[i] + fluxT[i]
        const before = depth[i]
        let after = before + ((inR + inL + inB + inT - out) * dt) / area
        if (after < 0) after = 0
        depth[i] = after
        const mean = (before + after) / 2
        if (mean > 1e-4) {
          velX[i] = (inR - fluxL[i] + fluxR[i] - inL) / 2 / (cellSize * mean)
          velY[i] = (inB - fluxT[i] + fluxB[i] - inT) / 2 / (cellSize * mean)
        } else {
          velX[i] = 0
          velY[i] = 0
        }
      }
    }

    this.time += dt
    this.rained += rainedStep * area
    this.infiltrated += infiltratedStep * area
    this.outflow += outflowStep
  }
}
