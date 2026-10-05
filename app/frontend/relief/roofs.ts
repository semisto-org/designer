// Roof shapes read from the surface model. OpenStreetMap almost never says
// how a roof is shaped, but the surface model sees it: within a footprint,
// the heights above the ground are fitted with a few simple shapes (flat,
// gable along either axis of the building, single slope) and the best one
// is kept. A shape is a function of the position; the roof is then made of
// planar faces cut along the ridge, and the walls follow the roof at each
// corner (gable ends included). No import of three.js.

export type Point = { x: number; y: number }
export type RoofShape =
  | { type: 'flat'; height: number }
  | { type: 'gable'; angle: number; centre: number; ridge: number; slope: number; origin: Point }
  | { type: 'shed'; angle: number; height: number; slope: number; origin: Point }

/** A sample of the surface model: a cell centre and what stands above the ground there. */
export type RoofSample = { x: number; y: number; z: number }

/** A wall corner with the roof's height above it, and a planar piece of roof. */
export type Shell = { ring: Array<Point & { top: number }>; faces: Array<Array<Point & { h: number }>> }

const MIN_SAMPLES = 12
// A pitch under ~8° reads as flat; over ~60° it is noise or a tower.
const MIN_SLOPE = Math.tan((8 * Math.PI) / 180)
const MAX_SLOPE = Math.tan((60 * Math.PI) / 180)

/** The orientation of a footprint: the direction of the edge of its tightest bounding rectangle. */
export function mainAxis(ring: Point[]): number {
  let best = { angle: 0, area: Infinity }
  for (let k = 0; k < ring.length - 1; k++) {
    const angle = Math.atan2(ring[k + 1].y - ring[k].y, ring[k + 1].x - ring[k].x)
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
    let [uMin, uMax, vMin, vMax] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const p of ring) {
      const u = p.x * cos + p.y * sin
      const v = -p.x * sin + p.y * cos
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v)
    }
    const area = (uMax - uMin) * (vMax - vMin)
    // The long side of the rectangle gives the axis.
    if (area < best.area - 1e-9) best = { angle: uMax - uMin >= vMax - vMin ? angle : angle + Math.PI / 2, area }
  }
  return best.angle
}

/** Coordinate across a direction: the distance from the line through `origin` along `angle`. */
function across(p: Point, angle: number, origin: Point): number {
  return -(p.x - origin.x) * Math.sin(angle) + (p.y - origin.y) * Math.cos(angle)
}

/** Height of the roof above the base at a point. */
export function roofHeight(shape: RoofShape, p: Point): number {
  if (shape.type === 'flat') return shape.height
  const v = across(p, shape.angle, shape.origin)
  if (shape.type === 'shed') return shape.height + shape.slope * v
  return shape.ridge - shape.slope * Math.abs(v - shape.centre)
}

/** Least squares of z ≈ a + b·f: [a, b, residual sum of squares]. */
function line(f: number[], z: number[]): [number, number, number] {
  const n = f.length
  let sf = 0, sz = 0, sff = 0, sfz = 0
  for (let i = 0; i < n; i++) { sf += f[i]; sz += z[i]; sff += f[i] * f[i]; sfz += f[i] * z[i] }
  const det = n * sff - sf * sf
  const b = Math.abs(det) < 1e-9 ? 0 : (n * sfz - sf * sz) / det
  const a = (sz - b * sf) / n
  let rss = 0
  for (let i = 0; i < n; i++) rss += (z[i] - a - b * f[i]) ** 2
  return [a, b, rss]
}

/**
 * The shape that explains the samples best, a richer one only when it
 * explains them clearly better (BIC). Too few samples, or a slope that no
 * roof has: flat, at the median height.
 */
export function fitRoof(ring: Point[], samples: RoofSample[], fallback: number): RoofShape {
  const z = samples.map((s) => s.z)
  const sorted = [...z].sort((a, b) => a - b)
  const median = sorted.length ? sorted[sorted.length >> 1] : fallback
  const flat: RoofShape = { type: 'flat', height: sorted.length ? median : fallback }
  const n = samples.length
  if (n < MIN_SAMPLES) return flat

  const origin = { x: samples.reduce((s, p) => s + p.x, 0) / n, y: samples.reduce((s, p) => s + p.y, 0) / n }
  const mean = z.reduce((s, v) => s + v, 0) / n
  const score = (rss: number, k: number) => n * Math.log(Math.max(rss, 1e-6) / n) + k * Math.log(n)
  let best: { shape: RoofShape; score: number } = { shape: flat, score: score(z.reduce((s, v) => s + (v - mean) ** 2, 0), 1) }

  const axis = mainAxis(ring)
  for (const angle of [axis, axis + Math.PI / 2]) {
    const vs = samples.map((p) => across(p, angle, origin))
    const ringVs = ring.map((p) => across(p, angle, origin))
    const [vMin, vMax] = [Math.min(...ringVs), Math.max(...ringVs)]
    // Single slope, across this direction.
    const [a, b, rssShed] = line(vs, z)
    const shedScore = score(rssShed, 2)
    if (Math.abs(b) >= MIN_SLOPE && Math.abs(b) <= MAX_SLOPE && shedScore < best.score) {
      best = { shape: { type: 'shed', angle, height: a, slope: b, origin }, score: shedScore }
    }
    // Gable: the ridge along this direction, somewhere near the middle.
    for (let t = 0.3; t <= 0.7001; t += 0.05) {
      const centre = vMin + (vMax - vMin) * t
      const [ridge, negSlope, rss] = line(vs.map((v) => Math.abs(v - centre)), z)
      const slope = -negSlope
      const gableScore = score(rss, 3)
      if (slope >= MIN_SLOPE && slope <= MAX_SLOPE && gableScore < best.score) {
        best = { shape: { type: 'gable', angle, centre, ridge, slope, origin }, score: gableScore }
      }
    }
  }
  return best.shape
}

/** The part of a ring on one side of the ridge (Sutherland–Hodgman against one line). */
function clip(ring: Point[], keep: (p: Point) => number): Point[] {
  const out: Point[] = []
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]
    const b = ring[(k + 1) % ring.length]
    const da = keep(a)
    const db = keep(b)
    if (da >= 0) out.push(a)
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

/**
 * The walls and roof faces of one footprint ring (closed, first = last) under
 * a shape. Heights are above the base, never under `min`.
 */
export function shell(closed: Point[], shape: RoofShape, min: number, max: number): Shell {
  const height = (p: Point) => Math.min(max, Math.max(min, roofHeight(shape, p)))
  let ring = closed.slice(0, -1)
  let faces: Point[][] = [ring]
  if (shape.type === 'gable') {
    const side = (p: Point) => across(p, shape.angle, shape.origin) - shape.centre
    // The ridge crosses the walls at the gable ends: a corner there.
    const withRidge: Point[] = []
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]
      const b = ring[(k + 1) % ring.length]
      withRidge.push(a)
      const [sa, sb] = [side(a), side(b)]
      if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
        const t = sa / (sa - sb)
        withRidge.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      }
    }
    ring = withRidge
    faces = [clip(ring, side), clip(ring, (p) => -side(p))].filter((f) => f.length >= 3)
  }
  return {
    ring: ring.map((p) => ({ ...p, top: height(p) })),
    faces: faces.map((face) => face.map((p) => ({ ...p, h: height(p) }))),
  }
}
