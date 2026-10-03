// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The map's water design on the relief: swales (and keylines) and ponds are
// "dug" into a COPY of the terrain so that the simulated rain and the flow
// axes take them into account. In Claudy they were traced on the 3D view; in
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

export type Design = SwaleDesign | PondDesign

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
 * of water it holds before spilling). The stored relief is never modified.
 */
export function applyDesigns(base: ArrayLike<number>, cols: number, rows: number, cellSize: number, designs: Design[]) {
  const out = Float32Array.from(base)
  const footprints: Footprint[] = []
  for (const design of designs) {
    const cells = design.type === 'pond'
      ? digPond(out, base, cols, rows, cellSize, design)
      : digSwale(out, base, cols, rows, cellSize, design)
    footprints.push({ id: design.id, cells, capacity: 0 })
  }
  for (const footprint of footprints) footprint.capacity = capacity(out, cols, rows, cellSize, footprint.cells)
  return { heights: out, footprints }
}

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
