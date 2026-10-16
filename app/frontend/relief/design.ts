// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The map's water design on the relief: swales (and keylines), ponds and
// half-moons are "dug" into a COPY of the terrain, banks and structures
// across the flow (check dams, fascines, beaver dam analogues, hedge banks)
// raised on it, so that the simulated rain and the flow axes take them into
// account. In Claudy they were traced on the 3D view; in
// Designer they are the map's own features (a pond polygon, a swale line),
// drawn in the editor and dug here with default dimensions or those of their
// properties.
//
// Coordinates: metres on the grid, x east from the first column, y SOUTH
// from the first row (one cell = `cellSize` m). No import.

export type GridPoint = { x: number; y: number }

/** Bilinear height at a grid point. */
export function heightAt(heights: ArrayLike<number>, cols: number, rows: number, cellSize: number, x: number, y: number): number {
  const fx = Math.min(cols - 1.001, Math.max(0, x / cellSize))
  const fy = Math.min(rows - 1.001, Math.max(0, y / cellSize))
  const c = Math.floor(fx)
  const r = Math.floor(fy)
  const tx = fx - c
  const ty = fy - r
  const i = r * cols + c
  const top = heights[i] * (1 - tx) + heights[i + 1] * tx
  const bottom = heights[i + cols] * (1 - tx) + heights[i + cols + 1] * tx
  return top * (1 - ty) + bottom * ty
}

function segmentDistance(px: number, py: number, a: GridPoint, b: GridPoint) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length2 = dx * dx + dy * dy
  let t = length2 ? ((px - a.x) * dx + (py - a.y) * dy) / length2 : 0
  t = Math.max(0, Math.min(1, t))
  const qx = a.x + t * dx
  const qy = a.y + t * dy
  return { distance: Math.hypot(px - qx, py - qy), t, side: dx * (py - a.y) - dy * (px - a.x) }
}

export type SwaleDesign = {
  id: number | string
  type: 'swale'
  points: GridPoint[]
  /** Trench width (m), depth below the line's level (m), downhill berm height (m). */
  width?: number
  depth?: number
  berm?: number
}

export type PondDesign = {
  id: number | string
  type: 'pond'
  /** Polygon outline (grid metres). */
  ring: GridPoint[]
  /** Depth at the deepest point (m) and berm height (m). */
  depth?: number
  berm?: number
}

export type BarrierDesign = {
  id: number | string
  type: 'barrier'
  points: GridPoint[]
  /** Crest height above the ground (m) and crest width (m). */
  height?: number
  width?: number
  /** A level crest (a dam across a gully: its height counts from the lowest ground) or one that follows the ground (a bank on contour). */
  level?: boolean
  /** 0 for an earth bank; for a porous structure, the share of the flow that seeps through below the crest. */
  seep?: number
  /** How far upstream (m) the water it holds can reach: its footprint, for the capacity. */
  pool?: number
}

export type HalfMoonDesign = {
  id: number | string
  type: 'half_moon'
  /** One centre per half-moon (grid metres). */
  centres: GridPoint[]
  /** Radius (m), depth at the centre (m), height of the downhill crescent berm (m). */
  radius?: number
  depth?: number
  berm?: number
}

export type Design = SwaleDesign | PondDesign | BarrierDesign | HalfMoonDesign

export type Footprint = { id: number | string; cells: number[]; capacity: number }

/**
 * Digs a swale into `out`: a trench `width` m wide, `depth` m below the
 * line's level (the line follows the ground: the level of each vertex is the
 * lowest ground along the line before it, so a swale drawn slightly off
 * contour still holds water in pockets), and a `berm` m above that level,
 * as wide, on the downhill side.
 */
function digSwale(out: Float32Array, base: ArrayLike<number>, cols: number, rows: number, cellSize: number, design: SwaleDesign): number[] {
  const { points } = design
  const width = design.width ?? 2
  const depth = design.depth ?? 0.5
  const berm = design.berm ?? 0.4
  const half = width / 2
  const reach = half + width
  const touched: number[] = []
  if (!points || points.length < 2) return touched
  const levels = points.map((p) => heightAt(base, cols, rows, cellSize, p.x, p.y))
  // The downhill side of each segment: the one where the terrain is lower.
  const downhill: number[] = []
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / length
    const ny = (b.x - a.x) / length
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const left = heightAt(base, cols, rows, cellSize, mx + nx * 2, my + ny * 2)
    const right = heightAt(base, cols, rows, cellSize, mx - nx * 2, my - ny * 2)
    downhill.push(left < right ? 1 : -1)
  }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const c0 = Math.max(0, Math.floor((minX - reach) / cellSize))
  const c1 = Math.min(cols - 1, Math.ceil((maxX + reach) / cellSize))
  const r0 = Math.max(0, Math.floor((minY - reach) / cellSize))
  const r1 = Math.min(rows - 1, Math.ceil((maxY + reach) / cellSize))
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const px = c * cellSize
      const py = r * cellSize
      let nearest: (ReturnType<typeof segmentDistance> & { k: number }) | null = null
      for (let k = 0; k < points.length - 1; k++) {
        const hit = segmentDistance(px, py, points[k], points[k + 1])
        if (!nearest || hit.distance < nearest.distance) nearest = { ...hit, k }
      }
      if (!nearest || nearest.distance > reach) continue
      const level = levels[nearest.k] + (levels[nearest.k + 1] - levels[nearest.k]) * nearest.t
      const i = r * cols + c
      // Every cell of the work belongs to its footprint, dug or not: without
      // it the capacity would see a false spillway. At least 3/4 of a cell of
      // half-width keeps the trench continuous diagonally.
      if (nearest.distance <= Math.max(half, cellSize * 0.75)) {
        out[i] = Math.min(out[i], level - depth)
        touched.push(i)
      } else if (berm > 0 && Math.sign(nearest.side) === downhill[nearest.k]) {
        out[i] = Math.max(out[i], level + berm)
        touched.push(i)
      }
    }
  }
  return touched
}

/** The ground along a line, sampled every half cell. */
function lineLowest(base: ArrayLike<number>, cols: number, rows: number, cellSize: number, points: GridPoint[]): number {
  let lowest = Infinity
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cellSize / 2)))
    for (let s = 0; s <= n; s++) lowest = Math.min(lowest, heightAt(base, cols, rows, cellSize, a.x + (b.x - a.x) * s / n, a.y + (b.y - a.y) * s / n))
  }
  return lowest
}

/**
 * Raises a structure across the flow: a crest `height` m high and `width` m
 * wide along the line. A level crest (a check dam, a beaver dam analogue)
 * stands `height` above the LOWEST ground of the line, so it holds a pool in
 * the gully and lets the banks frame it; otherwise (a fascine, a hedge bank)
 * it follows the ground. Its footprint takes the uphill cells, up to `pool`
 * m, lower than the crest: the water it holds. A porous crest is written to
 * `crest` and `seep` instead of `flow`, the terrain the water runs on.
 */
function digBarrier(out: Float32Array, flow: Float32Array, crest: Float32Array, seep: Float32Array, base: ArrayLike<number>,
  cols: number, rows: number, cellSize: number, design: BarrierDesign): number[] {
  const { points } = design
  const height = design.height ?? 0.4
  const half = Math.max((design.width ?? 0.6) / 2, cellSize * 0.75)
  const pool = design.pool ?? 20
  const porous = (design.seep ?? 0) > 0
  const touched: number[] = []
  if (!points || points.length < 2) return touched
  const levelCrest = design.level ? lineLowest(base, cols, rows, cellSize, points) + height : null
  const levels = points.map((p) => heightAt(base, cols, rows, cellSize, p.x, p.y))
  const uphill: number[] = []
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / length
    const ny = (b.x - a.x) / length
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const left = heightAt(base, cols, rows, cellSize, mx + nx * 2, my + ny * 2)
    const right = heightAt(base, cols, rows, cellSize, mx - nx * 2, my - ny * 2)
    uphill.push(left > right ? 1 : -1)
  }
  const reach = Math.max(half, pool)
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const c0 = Math.max(0, Math.floor((minX - reach) / cellSize))
  const c1 = Math.min(cols - 1, Math.ceil((maxX + reach) / cellSize))
  const r0 = Math.max(0, Math.floor((minY - reach) / cellSize))
  const r1 = Math.min(rows - 1, Math.ceil((maxY + reach) / cellSize))
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const px = c * cellSize
      const py = r * cellSize
      let nearest: (ReturnType<typeof segmentDistance> & { k: number }) | null = null
      for (let k = 0; k < points.length - 1; k++) {
        const hit = segmentDistance(px, py, points[k], points[k + 1])
        if (!nearest || hit.distance < nearest.distance) nearest = { ...hit, k }
      }
      if (!nearest || nearest.distance > reach) continue
      const top = levelCrest ?? levels[nearest.k] + (levels[nearest.k + 1] - levels[nearest.k]) * nearest.t + height
      const i = r * cols + c
      if (nearest.distance <= half) {
        if (top <= base[i]) continue
        out[i] = Math.max(out[i], top)
        if (porous) {
          crest[i] = crest[i] === crest[i] ? Math.max(crest[i], top) : top
          seep[i] = design.seep!
        } else {
          flow[i] = Math.max(flow[i], top)
        }
        touched.push(i)
      } else if (nearest.distance <= pool && Math.sign(nearest.side) === uphill[nearest.k] && base[i] < top) {
        touched.push(i)
      }
    }
  }
  return touched
}

/**
 * Digs half-moons: for each centre, a bowl `depth` m deep over the disc of
 * `radius`, below the ground at its centre, and a crescent berm `berm` m
 * high on its downhill half, so the open side faces the slope and catches
 * the runoff coming down it.
 */
function digHalfMoons(out: Float32Array, base: ArrayLike<number>, cols: number, rows: number, cellSize: number, design: HalfMoonDesign): number[] {
  const radius = Math.max(design.radius ?? 1.5, cellSize * 0.75)
  const depth = design.depth ?? 0.2
  const berm = design.berm ?? 0.15
  const rim = Math.max(0.5, cellSize)
  const touched: number[] = []
  for (const centre of design.centres ?? []) {
    const level = heightAt(base, cols, rows, cellSize, centre.x, centre.y)
    // The downhill direction, from the ground around the centre.
    const step = Math.max(radius, cellSize)
    const gx = heightAt(base, cols, rows, cellSize, centre.x + step, centre.y) - heightAt(base, cols, rows, cellSize, centre.x - step, centre.y)
    const gy = heightAt(base, cols, rows, cellSize, centre.x, centre.y + step) - heightAt(base, cols, rows, cellSize, centre.x, centre.y - step)
    const g = Math.hypot(gx, gy) || 1
    const dx = -gx / g
    const dy = -gy / g
    const outer = radius + rim
    const c0 = Math.max(0, Math.floor((centre.x - outer) / cellSize))
    const c1 = Math.min(cols - 1, Math.ceil((centre.x + outer) / cellSize))
    const r0 = Math.max(0, Math.floor((centre.y - outer) / cellSize))
    const r1 = Math.min(rows - 1, Math.ceil((centre.y + outer) / cellSize))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = c * cellSize - centre.x
        const y = r * cellSize - centre.y
        const d = Math.hypot(x, y)
        const i = r * cols + c
        const downhill = x * dx + y * dy >= 0
        if (d <= radius) {
          const s = d / radius
          out[i] = Math.min(out[i], level - depth * (1 - s * s))
          touched.push(i)
        } else if (d <= outer && downhill) {
          out[i] = Math.max(out[i], level + berm)
          touched.push(i)
        }
      }
    }
  }
  return touched
}

/** Grid cells whose centre lies inside a polygon outline (grid metres). */
export function ringCells(cols: number, rows: number, cellSize: number, ring: GridPoint[]): number[] {
  if (!ring || ring.length < 3) return []
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const cells: number[] = []
  for (let r = Math.max(0, Math.floor(minY / cellSize)); r <= Math.min(rows - 1, Math.ceil(maxY / cellSize)); r++) {
    for (let c = Math.max(0, Math.floor(minX / cellSize)); c <= Math.min(cols - 1, Math.ceil(maxX / cellSize)); c++) {
      if (insideRing(c * cellSize, r * cellSize, ring)) cells.push(r * cols + c)
    }
  }
  return cells
}

/** Even-odd point in polygon (grid metres). */
export function insideRing(x: number, y: number, ring: GridPoint[]): boolean {
  let inside = false
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const a = ring[k]
    const b = ring[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Digs a pond inside its outline: a parabolic bowl `depth` m deep at the
 * point farthest from the shore, below the LOWEST ground of the outline (the
 * water surface), ringed by a 2 m berm `berm` m above that level. On a slope
 * the berm holds the water downhill; uphill the terrain makes the shore.
 */
function digPond(out: Float32Array, base: ArrayLike<number>, cols: number, rows: number, cellSize: number, design: PondDesign): number[] {
  const ring = design.ring
  const depth = design.depth ?? 1
  const berm = design.berm ?? 0.3
  const touched: number[] = []
  if (!ring || ring.length < 3) return touched
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const outer = 2
  const c0 = Math.max(0, Math.floor((minX - outer) / cellSize))
  const c1 = Math.min(cols - 1, Math.ceil((maxX + outer) / cellSize))
  const r0 = Math.max(0, Math.floor((minY - outer) / cellSize))
  const r1 = Math.min(rows - 1, Math.ceil((maxY + outer) / cellSize))
  const shoreDistance = (x: number, y: number) => {
    let best = Infinity
    for (let k = 0; k < ring.length; k++) {
      const d = segmentDistance(x, y, ring[k], ring[(k + 1) % ring.length]).distance
      if (d < best) best = d
    }
    return best
  }
  // The water level: the lowest ground under the outline.
  let level = Infinity
  for (const p of ring) level = Math.min(level, heightAt(base, cols, rows, cellSize, p.x, p.y))
  const inside: Array<{ i: number; d: number }> = []
  let deepest = 0
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = c * cellSize
      const y = r * cellSize
      const i = r * cols + c
      const d = shoreDistance(x, y)
      if (insideRing(x, y, ring)) {
        inside.push({ i, d })
        if (d > deepest) deepest = d
      } else if (d <= outer) {
        out[i] = Math.max(out[i], level + berm)
        touched.push(i)
      }
    }
  }
  // Claudy's circular bowl `depth·(1 − (r/R)²)`, written with the distance
  // to the shore s = d/R so it fits any outline: depth·s·(2 − s).
  const radius = Math.max(deepest, cellSize)
  for (const { i, d } of inside) {
    const s = Math.min(1, d / radius)
    out[i] = Math.min(out[i], level - depth * s * (2 - s))
    touched.push(i)
  }
  return touched
}

/**
 * The relief with the designs dug, and for each its cells and capacity (m³
 * of water it holds before spilling). `heights` has everything (the mesh,
 * the flow axes, the capacities); `flow` is the ground the water runs on,
 * without the porous structures, which are in `crest` (their crest level,
 * NaN elsewhere) and `seep`. The stored relief is never modified.
 */
export function applyDesigns(base: ArrayLike<number>, cols: number, rows: number, cellSize: number, designs: Design[]) {
  const out = Float32Array.from(base)
  const n = out.length
  const crest = new Float32Array(n).fill(NaN)
  const seep = new Float32Array(n)
  const footprints: Footprint[] = []
  // Porous structures last: `flow` is the dug relief before them.
  const ordered = designs.map((design, index) => ({ design, index }))
    .sort((a, b) => Number(porous(a.design)) - Number(porous(b.design)) || a.index - b.index)
  let flow: Float32Array | null = null
  const cellsByIndex: number[][] = []
  for (const { design, index } of ordered) {
    if (porous(design) && !flow) flow = Float32Array.from(out)
    const target = flow ?? out
    cellsByIndex[index] = design.type === 'pond' ? digPond(out, base, cols, rows, cellSize, design)
      : design.type === 'half_moon' ? digHalfMoons(out, base, cols, rows, cellSize, design)
        : design.type === 'barrier' ? digBarrier(out, target, crest, seep, base, cols, rows, cellSize, design)
          : digSwale(out, base, cols, rows, cellSize, design)
  }
  designs.forEach((design, index) => footprints.push({ id: design.id, cells: cellsByIndex[index], capacity: 0 }))
  for (const footprint of footprints) footprint.capacity = capacity(out, cols, rows, cellSize, footprint.cells)
  return { heights: out, flow: flow ?? out, crest, seep, footprints }
}

const porous = (design: Design) => design.type === 'barrier' && (design.seep ?? 0) > 0

/**
 * What a footprint holds before spilling. Fill from its lowest cell, always
 * advancing through the lowest cell of the shore; the first cell OUTSIDE the
 * footprint reached is the spillway: the water stops at its height (or at
 * the sill already crossed if higher). The volume under that plane, flooded
 * cell by flooded cell, is the capacity (m³).
 */
export function capacity(heights: ArrayLike<number>, cols: number, rows: number, cellSize: number, cells: number[]): number {
  if (!cells.length) return 0
  const inside = new Set(cells)
  let start = cells[0]
  for (const i of inside) if (heights[i] < heights[start]) start = i
  const seen = new Set([start])
  const frontier = [start]
  const flooded: number[] = []
  let level = heights[start]
  let spill: number | null = null
  while (frontier.length && flooded.length < 200000) {
    let lowest = 0
    for (let k = 1; k < frontier.length; k++) if (heights[frontier[k]] < heights[frontier[lowest]]) lowest = k
    const i = frontier[lowest]
    frontier[lowest] = frontier[frontier.length - 1]
    frontier.pop()
    if (!inside.has(i)) {
      spill = Math.max(level, heights[i])
      break
    }
    if (heights[i] > level) level = heights[i]
    flooded.push(i)
    const c = i % cols
    const r = (i - c) / cols
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc
      const rr = r + dr
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue
      const j = rr * cols + cc
      if (!seen.has(j)) { seen.add(j); frontier.push(j) }
    }
  }
  const surface = spill ?? level
  let volume = 0
  for (const i of flooded) if (surface > heights[i]) volume += (surface - heights[i]) * cellSize * cellSize
  return volume
}

/**
 * The simulation grid (blocks of `factor × factor`) of a dug relief. A block
 * touching a trench or a bowl takes the LOWEST dug bottom of the block, a
 * berm block its CREST, the others the mean terrain. Averaging the terrain
 * around a trench raised its bottom by tens of centimetres from one block to
 * the next: a 1 % keyline became a string of pockets.
 */
export function downsampleDesigned(base: ArrayLike<number>, designed: ArrayLike<number>, cols: number, rows: number, factor: number): Float32Array {
  if (factor <= 1) return Float32Array.from(designed)
  const outCols = Math.floor(cols / factor)
  const outRows = Math.floor(rows / factor)
  const out = new Float32Array(outCols * outRows)
  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      let sum = 0
      let dug = Infinity
      let raised = -Infinity
      for (let dr = 0; dr < factor; dr++) {
        for (let dc = 0; dc < factor; dc++) {
          const i = (r * factor + dr) * cols + c * factor + dc
          sum += base[i]
          if (designed[i] < base[i] && designed[i] < dug) dug = designed[i]
          if (designed[i] > base[i] && designed[i] > raised) raised = designed[i]
        }
      }
      out[r * outCols + c] = dug < Infinity ? dug : raised > -Infinity ? raised : sum / (factor * factor)
    }
  }
  return out
}

/**
 * The porous structures on the simulation grid: a block holding part of a
 * crest takes its highest crest and the least seep of its cells.
 */
export function downsampleCrest(crest: ArrayLike<number>, seep: ArrayLike<number>, cols: number, rows: number, factor: number) {
  const f = Math.max(1, factor)
  const outCols = Math.floor(cols / f)
  const outRows = Math.floor(rows / f)
  const outCrest = new Float32Array(outCols * outRows).fill(NaN)
  const outSeep = new Float32Array(outCols * outRows)
  let any = false
  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      let top = -Infinity
      let least = Infinity
      for (let dr = 0; dr < f; dr++) {
        for (let dc = 0; dc < f; dc++) {
          const i = (r * f + dr) * cols + c * f + dc
          if (crest[i] !== crest[i]) continue
          if (crest[i] > top) top = crest[i]
          if (seep[i] < least) least = seep[i]
        }
      }
      if (top > -Infinity) {
        outCrest[r * outCols + c] = top
        outSeep[r * outCols + c] = least
        any = true
      }
    }
  }
  return any ? { crest: outCrest, seep: outSeep } : null
}

/** Points every `spacing` m along a line, from its start (grid metres). */
export function pointsAlong(points: GridPoint[], spacing: number): GridPoint[] {
  if (points.length < 2 || !(spacing > 0)) return points.slice(0, 1)
  const out: GridPoint[] = [points[0]]
  let carried = 0
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]
    const b = points[k + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    let at = spacing - carried
    while (at <= length + 1e-9) {
      out.push({ x: a.x + (b.x - a.x) * at / length, y: a.y + (b.y - a.y) * at / length })
      at += spacing
    }
    carried = length - (at - spacing)
  }
  return out
}
