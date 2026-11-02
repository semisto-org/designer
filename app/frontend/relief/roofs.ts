// Roof shapes read from the surface model. OpenStreetMap almost never says
// how a roof is shaped, but the surface model sees it: within a footprint,
// the heights above the ground are fitted with a few simple shapes (flat,
// gable along either axis of the building, single slope) and the best one
// is kept. A shape is a function of the position; the roof is then made of
// planar faces cut along the ridge, and the walls follow the roof at each
// corner (gable ends included). A drawn building's roof is the person's
// own (`designedRoof`): flat, single slope, gable or hip, at the eaves and
// ridge heights they give. No import of three.js.

export type Point = { x: number; y: number }
export type RoofShape =
  | { type: 'flat'; height: number }
  | { type: 'gable'; angle: number; centre: number; ridge: number; slope: number; origin: Point }
  | { type: 'shed'; angle: number; height: number; slope: number; origin: Point }
  /** Four slopes rising from every wall of the footprint's rectangle, at the same pitch. */
  | { type: 'hip'; angle: number; origin: Point; uMin: number; uMax: number; vMin: number; vMax: number; eaves: number; slope: number }

/** The roof a person gives a drawn building (its card or the 3D view). */
export type RoofSpec = {
  shape: 'flat' | 'shed' | 'gable' | 'hip'
  /** Highest point (the ridge), above the ground. */
  height: number
  /** Height of the gutters; null: a usual 35° pitch from the ridge. */
  eaves: number | null
  /** The ridge along the long side of the building, or across it. */
  ridge: 'long' | 'short'
  /** Single slope: the high side on the other wall. */
  flip: boolean
}

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

/** Coordinate along a direction, from `origin`. */
function along(p: Point, angle: number, origin: Point): number {
  return (p.x - origin.x) * Math.cos(angle) + (p.y - origin.y) * Math.sin(angle)
}

/** A hip roof's distances to the four walls of its rectangle, at a point. */
function hipDistances(shape: Extract<RoofShape, { type: 'hip' }>, p: Point): number[] {
  const u = along(p, shape.angle, shape.origin)
  const v = across(p, shape.angle, shape.origin)
  return [u - shape.uMin, shape.uMax - u, v - shape.vMin, shape.vMax - v]
}

/** Height of the roof above the base at a point. */
export function roofHeight(shape: RoofShape, p: Point): number {
  if (shape.type === 'flat') return shape.height
  if (shape.type === 'hip') return shape.eaves + shape.slope * Math.max(0, Math.min(...hipDistances(shape, p)))
  const v = across(p, shape.angle, shape.origin)
  if (shape.type === 'shed') return shape.height + shape.slope * v
  return shape.ridge - shape.slope * Math.abs(v - shape.centre)
}

const USUAL_PITCH = Math.tan((35 * Math.PI) / 180)

/**
 * A drawn building's roof from what the person gave: the ridge along the
 * long side of the footprint's tightest rectangle (or across it), eaves on
 * the walls, the ridge at the top. Without an eaves height, a usual 35°
 * pitch, never lower than `minEaves`.
 */
export function designedRoof(closed: Point[], spec: RoofSpec, minEaves = 0): RoofShape {
  const height = spec.height
  const ring = closed.length > 1 && closed[0].x === closed[closed.length - 1].x && closed[0].y === closed[closed.length - 1].y ? closed.slice(0, -1) : closed
  if (spec.shape === 'flat' || ring.length < 3) return { type: 'flat', height }
  const axis = mainAxis([...ring, ring[0]])
  const angle = spec.ridge === 'short' ? axis + Math.PI / 2 : axis
  const origin = { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length }
  const us = ring.map((p) => along(p, angle, origin))
  const vs = ring.map((p) => across(p, angle, origin))
  const [uMin, uMax, vMin, vMax] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]
  const spanU = uMax - uMin
  const spanV = vMax - vMin
  if (spanV < 0.1 || spanU < 0.1) return { type: 'flat', height }
  // How far the roof rises, from the gutters to the top.
  const run = spec.shape === 'shed' ? spanV : spec.shape === 'hip' ? Math.min(spanU, spanV) / 2 : spanV / 2
  const wanted = spec.eaves ?? height - run * USUAL_PITCH
  const eaves = Math.min(height, Math.max(Math.min(minEaves, height), wanted))
  const slope = (height - eaves) / run
  if (slope <= 1e-6) return { type: 'flat', height }
  if (spec.shape === 'gable') return { type: 'gable', angle, centre: (vMin + vMax) / 2, ridge: height, slope, origin }
  if (spec.shape === 'hip') return { type: 'hip', angle, origin, uMin, uMax, vMin, vMax, eaves, slope }
  // Single slope: low on the vMin wall, high on the vMax one (or the other way round).
  return spec.flip
    ? { type: 'shed', angle, height: eaves + slope * vMax, slope: -slope, origin }
    : { type: 'shed', angle, height: eaves - slope * vMin, slope, origin }
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
  const { cuts, regions } = planes(shape)
  if (cuts.length) {
    // Where a wall crosses the line between two slopes (a gable end, a
    // hip's corner), it gets a corner: the wall's top follows the roof.
    const withCorners: Point[] = []
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]
      const b = ring[(k + 1) % ring.length]
      withCorners.push(a)
      const ts: number[] = []
      for (const cut of cuts) {
        const [sa, sb] = [cut(a), cut(b)]
        if ((sa > 1e-9 && sb < -1e-9) || (sa < -1e-9 && sb > 1e-9)) ts.push(sa / (sa - sb))
      }
      for (const t of ts.sort((p, q) => p - q)) withCorners.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
    ring = withCorners
    faces = regions.map((keeps) => keeps.reduce((face, keep) => (face.length >= 3 ? clip(face, keep) : face), ring)).filter((f) => f.length >= 3)
  }
  return {
    ring: ring.map((p) => ({ ...p, top: height(p) })),
    faces: faces.map((face) => face.map((p) => ({ ...p, h: height(p) }))),
  }
}

/**
 * The planar pieces of a roof: the lines where its slopes meet (`cuts`), and
 * each slope as the half-planes that keep it (`regions`, ≥ 0 inside).
 */
function planes(shape: RoofShape): { cuts: Array<(p: Point) => number>; regions: Array<Array<(p: Point) => number>> } {
  if (shape.type === 'gable') {
    const side = (p: Point) => across(p, shape.angle, shape.origin) - shape.centre
    return { cuts: [side], regions: [[side], [(p) => -side(p)]] }
  }
  if (shape.type === 'hip') {
    const d = (i: number) => (p: Point) => hipDistances(shape, p)[i]
    const cuts: Array<(p: Point) => number> = []
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) cuts.push((p) => d(i)(p) - d(j)(p))
    // Slope i: where wall i is the nearest one.
    const regions = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].filter((j) => j !== i).map((j) => (p: Point) => d(j)(p) - d(i)(p)))
    return { cuts, regions }
  }
  return { cuts: [], regions: [] }
}
