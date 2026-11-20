// « Tracer l'eau » in the 3D view: a swale that follows the contour under
// the cursor, a pond or a mound set down on the slope. Pure geometry, in grid
// cells: the controller turns what it returns into lines over the terrain
// and, once the trace is done, into a map feature dug into the relief.

import { ContourField, lineLength, locate, simplify, slice, type CellPoint, type ContourLine } from './contourTrace.ts'

export type WaterToolKind = 'swale' | 'pond' | 'mound'

/** What to draw over the terrain while tracing, and the measures shown on the card. */
export type WaterSketch = {
  kind: WaterToolKind
  /** The contour under the cursor, faint: where a swale started there would run. */
  guide: CellPoint[] | null
  /** The work as it would be traced now. */
  trace: CellPoint[] | null
  closed: boolean
  anchor: CellPoint | null
  /** Swale: length (m) and altitude of its level line. Pond, mound: radius (m) and area (m²). */
  lengthM: number | null
  level: number | null
  radiusM: number | null
  areaM2: number | null
  /** No contour here (flat ground or the edge of the relief). */
  flat: boolean
}

/** The work traced, in cells: a line for a swale, a ring for a pond or a mound. */
export type WaterTrace = { kind: WaterToolKind; points: CellPoint[]; closed: boolean; level: number | null }

// How much of the contour the guide shows on each side of the cursor (m).
const GUIDE_M = 25
export const SWALE_MIN_M = 2
export const SWALE_MAX_M = 300
export const RADIUS_MIN_M = 0.75
export const RADIUS_MAX_M = 30
const RING_POINTS = 36

export class WaterTool {
  readonly kind: WaterToolKind
  private readonly field: ContourField
  private readonly cell: number
  private anchor: CellPoint | null = null
  private line: ContourLine | null = null
  private anchorAlong = 0
  private last: WaterSketch

  constructor(kind: WaterToolKind, field: ContourField, cellSizeM: number) {
    this.kind = kind
    this.field = field
    this.cell = cellSizeM
    this.last = this.empty()
  }

  get placing(): boolean { return this.anchor != null }
  get sketch(): WaterSketch { return this.last }

  /** The cursor moved over the terrain at `p` (cells). */
  hover(p: CellPoint): WaterSketch {
    this.last = this.kind === 'swale' ? this.hoverSwale(p) : this.hoverRound(p)
    return this.last
  }

  /**
   * A click at `p`: the first sets the start (or the centre), the second
   * ends the trace. Returns the trace when it is done, else null.
   */
  click(p: CellPoint): WaterTrace | null {
    if (!this.anchor) {
      if (this.kind === 'swale') {
        const line = this.field.trace(p.c, p.r)
        if (!line) return null
        this.line = line
        this.anchorAlong = locate(line.points, p).along
      }
      this.anchor = p
      this.hover(p)
      return null
    }
    const sketch = this.hover(p)
    if (!sketch.trace) return null
    if (this.kind === 'swale') {
      if ((sketch.lengthM ?? 0) < SWALE_MIN_M) return null
      return { kind: 'swale', points: simplify(sketch.trace, 0.3), closed: false, level: sketch.level }
    }
    if ((sketch.radiusM ?? 0) < RADIUS_MIN_M) return null
    return { kind: this.kind, points: sketch.trace, closed: true, level: null }
  }

  /** Start again from the first click. */
  reset() {
    this.anchor = null
    this.line = null
    this.last = this.empty()
  }

  private empty(): WaterSketch {
    return { kind: this.kind, guide: null, trace: null, closed: false, anchor: null, lengthM: null, level: null, radiusM: null, areaM2: null, flat: false }
  }

  private hoverSwale(p: CellPoint): WaterSketch {
    const guideCells = GUIDE_M / this.cell
    if (!this.anchor || !this.line) {
      const line = this.field.trace(p.c, p.r)
      if (!line) return { ...this.empty(), flat: true }
      const at = locate(line.points, p).along
      return { ...this.empty(), guide: slice(line, at - guideCells, at + guideCells), level: line.level }
    }
    const line = this.line
    const at = locate(line.points, p).along
    const maxCells = SWALE_MAX_M / this.cell
    const to = Math.max(this.anchorAlong - maxCells, Math.min(this.anchorAlong + maxCells, at))
    const trace = slice(line, this.anchorAlong, to)
    const ahead = to >= this.anchorAlong ? 1 : -1
    return {
      ...this.empty(),
      anchor: this.anchor,
      guide: slice(line, Math.min(this.anchorAlong, to) - (ahead < 0 ? guideCells : 0), Math.max(this.anchorAlong, to) + (ahead > 0 ? guideCells : 0)),
      trace,
      lengthM: lineLength(trace) * this.cell,
      level: line.level,
    }
  }

  private hoverRound(p: CellPoint): WaterSketch {
    if (!this.anchor) return { ...this.empty(), guide: ring(p, RADIUS_MIN_M * 2 / this.cell) }
    const a = this.anchor
    const radius = Math.min(RADIUS_MAX_M, Math.max(0, Math.hypot(p.c - a.c, p.r - a.r) * this.cell))
    const trace = ring(a, Math.max(radius, 0.01) / this.cell)
    return { ...this.empty(), anchor: a, trace, closed: true, radiusM: radius, areaM2: Math.PI * radius * radius }
  }
}

/** A ring of points around a centre (cells), closed (first = last). */
export function ring(centre: CellPoint, radiusCells: number, count = RING_POINTS): CellPoint[] {
  const points: CellPoint[] = []
  for (let k = 0; k <= count; k++) {
    const angle = (k % count) / count * Math.PI * 2
    points.push({ c: centre.c + Math.cos(angle) * radiusCells, r: centre.r + Math.sin(angle) * radiusCells })
  }
  return points
}
