/**
 * Every contour line of a relief grid, for the base plan of the drawn view
 * (map/drawn): marching squares over the whole grid, heights lightly
 * smoothed first (as relief/contourTrace), segments chained into lines.
 * Pure (no MapLibre, no DOM), tested in test/frontend/drawn.
 */

/** A contour line in grid cells (column, row), fractional. */
export type GridContour = { level: number; master: boolean; points: Array<[number, number]>; closed: boolean }

/**
 * The step between two lines for a relief this high (m): about a dozen to
 * forty lines across the land, as a surveyor's plan draws them. Every fifth
 * is a master line, drawn darker and labelled.
 */
export function contourInterval(range: number): number {
  if (!(range > 0)) return 1
  if (range < 4) return 0.25
  if (range < 8) return 0.5
  if (range < 25) return 1
  if (range < 60) return 2
  if (range < 150) return 5
  return 10
}

/** Whether a level is a master line (every fifth interval). */
export function isMaster(level: number, interval: number): boolean {
  const n = Math.round(level / interval)
  return Math.abs(n * interval - level) < 1e-6 && n % 5 === 0
}

// Corners of a square: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left.
// Edges: 0 top (0-1), 1 right (1-2), 2 bottom (3-2), 3 left (0-3).
const EDGE_CORNERS: Array<[number, number]> = [[0, 1], [1, 2], [3, 2], [0, 3]]
// Pairs of edges crossed by the line, per case (bit i = corner i above the level).
const SEGMENTS: Record<number, Array<[number, number]>> = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
  9: [[2, 0]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
}

/**
 * All contour lines of the grid at `interval` m. `heights` is row-major,
 * top row first; NaN marks a cell without data. Lines shorter than
 * `minPoints` (specks on a flat) are left out.
 */
export function gridContours(heights: ArrayLike<number>, cols: number, rows: number, interval: number, minPoints = 4): GridContour[] {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < heights.length; i++) {
    const z = heights[i]
    if (Number.isNaN(z)) continue
    if (z < min) min = z
    if (z > max) max = z
  }
  if (!Number.isFinite(min) || max - min < interval / 2) return []
  const lines: GridContour[] = []
  for (let level = Math.ceil(min / interval) * interval; level <= max; level += interval) {
    const rounded = Math.round(level * 1000) / 1000
    for (const line of levelLines(heights, cols, rows, rounded)) {
      if (line.points.length < minPoints) continue
      lines.push({ level: rounded, master: isMaster(rounded, interval), ...line })
    }
  }
  return lines
}

function levelLines(z: ArrayLike<number>, cols: number, rows: number, level: number) {
  // An edge point is keyed by the edge it sits on, so segments of
  // neighbouring squares meet on the same key and chain exactly.
  const at = (c: number, r: number) => z[r * cols + c]
  const edgeKey = (c: number, r: number, edge: number) => {
    if (edge === 0) return 2 * (r * cols + c)
    if (edge === 2) return 2 * ((r + 1) * cols + c)
    if (edge === 3) return 2 * (r * cols + c) + 1
    return 2 * (r * cols + c + 1) + 1
  }
  const points = new Map<number, [number, number]>()
  const links = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    const la = links.get(a)
    if (la) la.push(b)
    else links.set(a, [b])
    const lb = links.get(b)
    if (lb) lb.push(a)
    else links.set(b, [a])
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v = [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)]
      if (v.some((h) => Number.isNaN(h))) continue
      const offsets: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]]
      let index = 0
      v.forEach((h, i) => { if (h >= level) index |= 1 << i })
      let pairs = SEGMENTS[index]
      if (index === 5 || index === 10) {
        // A saddle: the square's centre decides how the line goes through.
        const centre = (v[0] + v[1] + v[2] + v[3]) / 4 >= level
        pairs = (index === 5) === centre ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]]
      }
      if (!pairs) continue
      for (const pair of pairs) {
        const keys = pair.map((edge) => {
          const key = edgeKey(c, r, edge)
          if (!points.has(key)) {
            const [a, b] = EDGE_CORNERS[edge]
            const t = (level - v[a]) / (v[b] - v[a])
            const f = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5
            points.set(key, [c + offsets[a][0] + (offsets[b][0] - offsets[a][0]) * f, r + offsets[a][1] + (offsets[b][1] - offsets[a][1]) * f])
          }
          return key
        })
        link(keys[0], keys[1])
      }
    }
  }
  // Chain: start from line ends (one link) first, then what is left are rings.
  const used = new Set<number>()
  const result: Array<{ points: Array<[number, number]>; closed: boolean }> = []
  const walk = (start: number) => {
    const chain = [start]
    used.add(start)
    let current = start
    for (;;) {
      const next = (links.get(current) ?? []).find((k) => !used.has(k))
      if (next === undefined) break
      used.add(next)
      chain.push(next)
      current = next
    }
    const closed = chain.length > 2 && (links.get(current) ?? []).includes(start)
    const pts = chain.map((k) => points.get(k) as [number, number])
    if (closed) pts.push(pts[0])
    result.push({ points: pts, closed })
  }
  for (const [key, neighbours] of links) if (neighbours.length === 1 && !used.has(key)) walk(key)
  for (const key of links.keys()) if (!used.has(key)) walk(key)
  return result
}

/**
 * The grid thinned to at most `maxSide` cells a side (mean of each block),
 * so a large relief is outlined in well under a second; a base plan needs
 * the shape of the land, not each metre. Returns the step used.
 */
export function thinGrid(heights: ArrayLike<number>, cols: number, rows: number, maxSide: number): { heights: Float32Array; cols: number; rows: number; step: number } {
  const step = Math.max(1, Math.ceil(Math.max(cols, rows) / maxSide))
  if (step === 1) return { heights: Float32Array.from(heights), cols, rows, step }
  const outCols = Math.ceil(cols / step)
  const outRows = Math.ceil(rows / step)
  const out = new Float32Array(outCols * outRows)
  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      let sum = 0
      let n = 0
      for (let dr = 0; dr < step; dr++) {
        for (let dc = 0; dc < step; dc++) {
          const rr = r * step + dr
          const cc = c * step + dc
          if (rr >= rows || cc >= cols) continue
          const z = heights[rr * cols + cc]
          if (Number.isNaN(z)) continue
          sum += z
          n++
        }
      }
      out[r * outCols + c] = n ? sum / n : Number.NaN
    }
  }
  return { heights: out, cols: outCols, rows: outRows, step }
}
