// The contour line through a point, traced in the browser on the relief
// already loaded, so a swale drawn in the 3D view follows the level line
// under the cursor at every move. The same method as the server's
// Relief::Contour (trace_contour, « Suivre la courbe » on the map): heights
// lightly smoothed over about 2 m, then marching squares from the point both
// ways, saddles resolved by the square's centre. The server's line is the one
// that counts when a work is checked; this one is for the hand.

import { boxBlur } from './station.ts'

/** A point of the grid, in cells (column, row), fractional. */
export type CellPoint = { c: number; r: number }

export type ContourLine = {
  /** Points along the line, in cells. */
  points: CellPoint[]
  /** Altitude of the line (m). */
  level: number
  closed: boolean
}

const SMOOTHING_M = 2
const MAX_STEPS = 200_000
// Edges of a square: 0 top, 1 right, 2 bottom, 3 left; leaving through one
// enters the neighbour through the opposite edge.
const MOVES: Array<[number, number, number]> = [[0, -1, 2], [1, 0, 3], [0, 1, 0], [-1, 0, 1]]
const EDGE_CORNERS: Array<[number, number]> = [[0, 1], [1, 2], [3, 2], [0, 3]]
const CORNER_OFFSETS: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]]

/** The heights smoothed once, ready for any number of lines. */
export class ContourField {
  readonly cols: number
  readonly rows: number
  private readonly z: Float32Array

  constructor(heights: ArrayLike<number>, cols: number, rows: number, cellSizeM: number) {
    this.cols = cols
    this.rows = rows
    const radius = Math.min(3, Math.max(1, Math.round(SMOOTHING_M / 2 / cellSizeM)))
    this.z = boxBlur(heights, cols, rows, radius)
  }

  /** Smoothed altitude at a fractional cell (bilinear), or null outside the grid. */
  heightAt(c: number, r: number): number | null {
    const c0 = Math.floor(c)
    const r0 = Math.floor(r)
    if (!this.inside(c0, r0)) return null
    const [tl, tr, br, bl] = this.corners(c0, r0)
    const u = c - c0
    const v = r - r0
    const top = tl + (tr - tl) * u
    const bottom = bl + (br - bl) * u
    return top + (bottom - top) * v
  }

  /** The contour line through (c, r), or null where none can be traced (flat, outside). */
  trace(c: number, r: number, level: number | null = null): ContourLine | null {
    const c0 = Math.floor(c)
    const r0 = Math.floor(r)
    if (!this.inside(c0, r0)) return null
    const z = level ?? this.heightAt(c, r)
    if (z == null || !Number.isFinite(z)) return null
    const start = this.startEdges(c0, r0, c, r, z)
    if (!start) return null
    const [first, second] = start
    const a = this.crossing(c0, r0, first, z)
    const b = this.crossing(c0, r0, second, z)
    const forward = this.walk(c0, r0, second, z)
    if (forward.closed) return { points: [a, b, ...forward.points], level: z, closed: true }
    const backward = this.walk(c0, r0, first, z)
    return { points: [...backward.points.reverse(), a, b, ...forward.points], level: z, closed: false }
  }

  private inside(c: number, r: number) {
    return c >= 0 && r >= 0 && c < this.cols - 1 && r < this.rows - 1
  }

  private corners(c: number, r: number): [number, number, number, number] {
    const { z, cols } = this
    const i = r * cols + c
    return [z[i], z[i + 1], z[i + cols + 1], z[i + cols]]
  }

  private crossings(c: number, r: number, level: number): number[] {
    const z = this.corners(c, r)
    const edges: number[] = []
    for (let e = 0; e < 4; e++) {
      const [a, b] = EDGE_CORNERS[e]
      if ((z[a] >= level) !== (z[b] >= level)) edges.push(e)
    }
    return edges
  }

  private crossing(c: number, r: number, edge: number, level: number): CellPoint {
    const z = this.corners(c, r)
    const [a, b] = EDGE_CORNERS[edge]
    const t = (level - z[a]) / (z[b] - z[a])
    const [ac, ar] = CORNER_OFFSETS[a]
    const [bc, br] = CORNER_OFFSETS[b]
    return { c: c + ac + (bc - ac) * t, r: r + ar + (br - ar) * t }
  }

  /** On a saddle, the two pairs of edges joined, as the square's centre says. */
  private saddlePairs(c: number, r: number, level: number): Array<[number, number]> {
    const z = this.corners(c, r)
    const centreAbove = (z[0] + z[1] + z[2] + z[3]) / 4 >= level
    return centreAbove === (z[0] >= level) ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]]
  }

  private startEdges(c0: number, r0: number, c: number, r: number, level: number): [number, number] | null {
    const edges = this.crossings(c0, r0, level)
    if (edges.length === 2) return [edges[0], edges[1]]
    if (edges.length !== 4) return null
    let best: [number, number] | null = null
    let bestDistance = Infinity
    for (const pair of this.saddlePairs(c0, r0, level)) {
      const d = segmentDistance({ c, r }, this.crossing(c0, r0, pair[0], level), this.crossing(c0, r0, pair[1], level))
      if (d < bestDistance) { bestDistance = d; best = pair }
    }
    return best
  }

  private exitEdge(c: number, r: number, entry: number, level: number): number | null {
    const edges = this.crossings(c, r, level)
    if (!edges.includes(entry)) return null
    if (edges.length === 2) return edges[0] === entry ? edges[1] : edges[0]
    const pair = this.saddlePairs(c, r, level).find((p) => p.includes(entry))
    return pair ? (pair[0] === entry ? pair[1] : pair[0]) : null
  }

  private walk(c: number, r: number, edge: number, level: number): { points: CellPoint[]; closed: boolean } {
    const startC = c
    const startR = r
    const points: CellPoint[] = []
    for (let step = 0; step < MAX_STEPS; step++) {
      const [dc, dr, entry] = MOVES[edge]
      c += dc
      r += dr
      if (!this.inside(c, r)) return { points, closed: false }
      if (c === startC && r === startR) return { points, closed: true }
      const next = this.exitEdge(c, r, entry, level)
      if (next == null) return { points, closed: false }
      points.push(this.crossing(c, r, next, level))
      edge = next
    }
    return { points, closed: false }
  }
}

function segmentDistance(p: CellPoint, a: CellPoint, b: CellPoint): number {
  return Math.hypot(p.c - nearestOnSegment(p, a, b).c, p.r - nearestOnSegment(p, a, b).r)
}

function nearestOnSegment(p: CellPoint, a: CellPoint, b: CellPoint): CellPoint {
  const dc = b.c - a.c
  const dr = b.r - a.r
  const length2 = dc * dc + dr * dr
  const t = length2 ? Math.min(1, Math.max(0, ((p.c - a.c) * dc + (p.r - a.r) * dr) / length2)) : 0
  return { c: a.c + dc * t, r: a.r + dr * t }
}

/** Where a point falls along a line: the distance along it (cells) and how far it is from it. */
export function locate(points: readonly CellPoint[], p: CellPoint): { along: number; distance: number } {
  let best = { along: 0, distance: Infinity }
  let travelled = 0
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k]
    const b = points[k + 1]
    const q = nearestOnSegment(p, a, b)
    const d = Math.hypot(p.c - q.c, p.r - q.r)
    if (d < best.distance) best = { along: travelled + Math.hypot(q.c - a.c, q.r - a.r), distance: d }
    travelled += Math.hypot(b.c - a.c, b.r - a.r)
  }
  return best
}

/** Length of a line, in cells. */
export function lineLength(points: readonly CellPoint[]): number {
  let length = 0
  for (let k = 0; k + 1 < points.length; k++) length += Math.hypot(points[k + 1].c - points[k].c, points[k + 1].r - points[k].r)
  return length
}

/** The point at `along` cells from the start of a line. */
function pointAlong(points: readonly CellPoint[], along: number): CellPoint {
  let travelled = 0
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k]
    const b = points[k + 1]
    const length = Math.hypot(b.c - a.c, b.r - a.r)
    if (travelled + length >= along) {
      const t = length ? (along - travelled) / length : 0
      return { c: a.c + (b.c - a.c) * t, r: a.r + (b.r - a.r) * t }
    }
    travelled += length
  }
  return points[points.length - 1]
}

/**
 * The piece of a line between two places along it (cells from its start).
 * On a closed line, the shorter way round.
 */
export function slice(line: ContourLine, from: number, to: number): CellPoint[] {
  const { points, closed } = line
  const total = lineLength(points)
  let start = Math.min(from, to)
  let end = Math.max(from, to)
  if (closed && end - start > total / 2) {
    // The other way round: from `end` to the end of the ring, then on from its start.
    const tail = piece(points, end, total)
    const head = piece(points, 0, start)
    return [...tail, ...head.slice(1)]
  }
  start = Math.max(0, start)
  end = Math.min(total, end)
  return piece(points, start, end)
}

function piece(points: readonly CellPoint[], start: number, end: number): CellPoint[] {
  const out: CellPoint[] = [pointAlong(points, start)]
  let travelled = 0
  for (let k = 0; k + 1 < points.length; k++) {
    travelled += Math.hypot(points[k + 1].c - points[k].c, points[k + 1].r - points[k].r)
    if (travelled > start && travelled < end) out.push(points[k + 1])
  }
  out.push(pointAlong(points, end))
  return out
}

/** Douglas–Peucker, tolerance in cells. */
export function simplify(points: readonly CellPoint[], tolerance = 0.3): CellPoint[] {
  if (points.length < 3) return [...points]
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let index = -1
    let max = tolerance
    for (let k = first + 1; k < last; k++) {
      const d = segmentDistance(points[k], points[first], points[last])
      if (d > max) { max = d; index = k }
    }
    if (index >= 0) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, k) => keep[k])
}
