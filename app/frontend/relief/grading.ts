// Earthworks that reshape the ground to a designed surface, cut where the
// ground stands above it and filled where it lies below, with side slopes
// (talus) that meet the natural ground:
//
// - a plateau: a level platform inside a drawn outline (a terrace cut into a
//   slope, a building pad), its level given or hung on the ground (the
//   uphill edge: all fill; the middle: cut and fill balance; the downhill
//   edge: all cut);
// - a profile swept along a line: a bench (a level strip cut into the
//   slope, its level following the ground at the line, held level, or
//   falling at a set grade) or a bank (a raised strip of a given height).
//
// The same algorithm runs on the server (app/services/relief/grading.rb),
// which gives the volumes to the inspector, the earthworks balance and the
// MCP; here it reshapes the 3D relief. Keep both in step.
//
// Coordinates: metres on the grid, x east from the first column, y SOUTH
// from the first row (one cell = `cellSize` m). No import.

export type GradePoint = { x: number; y: number }

export type GradeDesign = {
  id: number | string
  type: 'grade'
  shape: 'plateau' | 'bench' | 'bank'
  /** Plateau outline (grid metres). */
  ring?: GradePoint[]
  /** Centre line of a bench or a bank (grid metres). */
  points?: GradePoint[]
  /** Absolute level (m): the plateau, a level bench, or a bank's crest. */
  level?: number | null
  /** Plateau without a level: where it meets the natural ground. */
  hinge?: 'upper' | 'middle' | 'lower'
  /** Bench or bank: strip width (m); bank: crest height above the ground (m). */
  width?: number
  height?: number
  /** Bench or bank: falls this much (%) along the line from its start, from `level` or the ground there. */
  grade?: number | null
  /** Side slopes: horizontal metres per metre of height (1.5 = 2 in 3). */
  ratio?: number
}

export type GradeResult = {
  /** m³ of ground taken out and brought in, in place. */
  cut: number
  fill: number
  /** m² of ground lowered and raised (the strip of topsoil to strip). */
  cutArea: number
  fillArea: number
  maxCut: number
  maxFill: number
  /** The plateau's level (m), or the bench's level at its start; null for a bank following the ground. */
  level: number | null
  /** Cells reshaped and their new heights. */
  cells: number[]
  heights: number[]
}

export const GRADE_RATIO_DEFAULT = 1.5
const BENCH_WIDTH_DEFAULT = 3
const BANK_WIDTH_DEFAULT = 1
const BANK_HEIGHT_DEFAULT = 0.8
/** How far a talus may run beyond the shape (m): about 8 m of height at 1.5. */
const MAX_TALUS_M = 12

function bilinear(heights: ArrayLike<number>, cols: number, rows: number, cellSize: number, x: number, y: number): number {
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

function inside(x: number, y: number, ring: GradePoint[]): boolean {
  let result = false
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const a = ring[k]
    const b = ring[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result
  }
  return result
}

/** Nearest point of a polyline: distance, and distance along the line (m) from its start. */
function nearest(points: GradePoint[], x: number, y: number, closed: boolean): { distance: number; along: number; px: number; py: number } {
  let best = { distance: Infinity, along: 0, px: x, py: y }
  let walked = 0
  const count = closed ? points.length : points.length - 1
  for (let k = 0; k < count; k++) {
    const a = points[k]
    const b = points[(k + 1) % points.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length2 = dx * dx + dy * dy
    const length = Math.sqrt(length2)
    const t = length2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2)) : 0
    const px = a.x + t * dx
    const py = a.y + t * dy
    const distance = Math.hypot(x - px, y - py)
    if (distance < best.distance) best = { distance, along: walked + t * length, px, py }
    walked += length
  }
  return best
}

/** A slope that leaves `level` at distance `d` beyond the edge and meets the ground `g`. */
function talus(level: number, g: number, d: number, ratio: number): number {
  return g > level ? Math.min(g, level + d / ratio) : Math.max(g, level - d / ratio)
}

function positive(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * The designed surface of one grading over the ground `base`, with its
 * volumes. Cells outside the grid are ignored (their volumes are not
 * counted); nodata must already be filled in `base`.
 */
export function grade(base: ArrayLike<number>, cols: number, rows: number, cellSize: number, design: GradeDesign): GradeResult {
  const ratio = positive(design.ratio, GRADE_RATIO_DEFAULT)
  const empty: GradeResult = { cut: 0, fill: 0, cutArea: 0, fillArea: 0, maxCut: 0, maxFill: 0, level: null, cells: [], heights: [] }
  const shape = design.shape
  const outline = shape === 'plateau' ? design.ring ?? [] : design.points ?? []
  if (shape === 'plateau' ? outline.length < 3 : outline.length < 2) return empty
  const halfWidth = shape === 'plateau' ? 0 : positive(design.width, shape === 'bench' ? BENCH_WIDTH_DEFAULT : BANK_WIDTH_DEFAULT) / 2
  const bankHeight = positive(design.height, BANK_HEIGHT_DEFAULT)
  const level = typeof design.level === 'number' && Number.isFinite(design.level) ? design.level : null
  const gradePct = typeof design.grade === 'number' && Number.isFinite(design.grade) ? design.grade : null

  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of outline) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const margin = halfWidth + MAX_TALUS_M
  const c0 = Math.max(0, Math.floor((minX - margin) / cellSize))
  const c1 = Math.min(cols - 1, Math.ceil((maxX + margin) / cellSize))
  const r0 = Math.max(0, Math.floor((minY - margin) / cellSize))
  const r1 = Math.min(rows - 1, Math.ceil((maxY + margin) / cellSize))
  if (c0 > c1 || r0 > r1) return empty

  // The plateau's level: given, or hung on the ground inside the outline.
  let plateau: number | null = null
  if (shape === 'plateau') {
    if (level != null) plateau = level
    else {
      let sum = 0; let count = 0; let low = Infinity; let high = -Infinity
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!inside(c * cellSize, r * cellSize, outline)) continue
          const g = base[r * cols + c]
          sum += g; count++
          low = Math.min(low, g); high = Math.max(high, g)
        }
      }
      if (!count) return empty
      plateau = design.hinge === 'upper' ? high : design.hinge === 'lower' ? low : sum / count
    }
  }
  const start = bilinear(base, cols, rows, cellSize, outline[0].x, outline[0].y)
  // The level of a bench or a bank's base at a distance along the line.
  const lineLevel = (along: number, px: number, py: number): number => {
    if (gradePct != null) return (level ?? start) - (gradePct / 100) * along
    if (level != null) return level
    return bilinear(base, cols, rows, cellSize, px, py)
  }

  const result: GradeResult = { ...empty, cells: [], heights: [], level: shape === 'plateau' ? plateau : shape === 'bench' ? (gradePct != null || level != null ? level ?? start : null) : null }
  const area = cellSize * cellSize
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c
      const x = c * cellSize
      const y = r * cellSize
      const g = base[i]
      let target: number
      if (shape === 'plateau') {
        const near = nearest(outline, x, y, true)
        target = inside(x, y, outline) ? plateau! : talus(plateau!, g, near.distance, ratio)
      } else {
        const near = nearest(outline, x, y, false)
        const beyond = Math.max(0, near.distance - halfWidth)
        if (beyond > MAX_TALUS_M) continue
        const base0 = lineLevel(near.along, near.px, near.py)
        if (shape === 'bench') target = near.distance <= halfWidth ? base0 : talus(base0, g, beyond, ratio)
        else {
          // A bank's crest: a height above the ground at its line, or an absolute level.
          const crest = level != null && gradePct == null ? level : base0 + bankHeight
          target = Math.max(g, crest - beyond / ratio)
        }
      }
      const delta = target - g
      if (Math.abs(delta) < 1e-6) continue
      result.cells.push(i)
      result.heights.push(target)
      if (delta > 0) {
        result.fill += delta * area
        result.fillArea += area
        result.maxFill = Math.max(result.maxFill, delta)
      } else {
        result.cut -= delta * area
        result.cutArea += area
        result.maxCut = Math.max(result.maxCut, -delta)
      }
    }
  }
  return result
}

/** Reshapes `out` with a grading over `base`; returns the cells touched. */
export function applyGrade(out: Float32Array, base: ArrayLike<number>, cols: number, rows: number, cellSize: number, design: GradeDesign): number[] {
  const graded = grade(base, cols, rows, cellSize, design)
  graded.cells.forEach((i, k) => { out[i] = graded.heights[k] })
  return graded.cells
}
