import type { LineString, Position } from 'geojson'

/**
 * Sector analysis: the energies and influences that come onto a terrain
 * from outside (sun, winds, fire, noise, views, wildlife, flooding…), each
 * from a range of directions, drawn as arcs around the site. A sector is a
 * `sector` feature of the notes layer: an arc (LineString) drawn clockwise
 * around the terrain's centre, its directions saved in `properties.from_deg`
 * and `to_deg` (equal for a sector all around), its type in `properties.sector_type`, its label in `name` and what it
 * means for the design in `notes`. The summer and winter sun are not drawn:
 * they follow from the latitude.
 *
 * Bearings are degrees clockwise from north (0 = N, 90 = E).
 */

export const SECTOR_TYPES = [
  'wind', 'cold_wind', 'fire', 'flood', 'frost', 'noise', 'dust', 'pollution',
  'good_view', 'bad_view', 'privacy', 'wildlife', 'predators', 'other',
] as const
export type SectorType = (typeof SECTOR_TYPES)[number]
export type SunSectorType = 'summer_sun' | 'winter_sun'

/** Soft field-notebook colours, close to those of a hand-drawn sector map. */
export const SECTOR_COLORS: Record<SectorType | SunSectorType, string> = {
  summer_sun: '#ec7a2c',
  winter_sun: '#e8b33a',
  wind: '#8cc6c8',
  cold_wind: '#6ea2c8',
  fire: '#e4705e',
  flood: '#88a794',
  frost: '#a8c3dc',
  noise: '#9c9a96',
  dust: '#aaa7a2',
  pollution: '#8b7f6e',
  good_view: '#a3bb8a',
  bad_view: '#b49b89',
  privacy: '#c2a5c8',
  wildlife: '#7fb2c4',
  predators: '#8f8d8a',
  other: '#9b8fb5',
}

export const isSectorType = (value: unknown): value is SectorType =>
  typeof value === 'string' && (SECTOR_TYPES as readonly string[]).includes(value)

/** 16 compass points, from N clockwise. */
export const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'] as const

export const normalize = (deg: number) => ((deg % 360) + 360) % 360

/** Degrees swept clockwise from `from` to `to` (a whole turn when they meet). */
export function sweep(from: number, to: number): number {
  const s = normalize(to - from)
  return s === 0 ? 360 : s
}

/** The nearest of the 16 compass points. */
export const compassPoint = (deg: number) => COMPASS_POINTS[Math.round(normalize(deg) / 22.5) % 16]

const METERS_PER_DEGREE = 111_320

/** Bearing from `center` to `point`, on the ground (fine at the size of a terrain). */
export function bearing(center: Position, point: Position): number {
  const kx = Math.cos((center[1] * Math.PI) / 180)
  const dx = (point[0] - center[0]) * kx
  const dy = point[1] - center[1]
  return normalize((Math.atan2(dx, dy) * 180) / Math.PI)
}

/** The point at `meters` from `center` towards `deg`. */
export function destination(center: Position, deg: number, meters: number): Position {
  const rad = (deg * Math.PI) / 180
  const kx = Math.cos((center[1] * Math.PI) / 180)
  return [
    center[0] + (Math.sin(rad) * meters) / (METERS_PER_DEGREE * kx),
    center[1] + (Math.cos(rad) * meters) / METERS_PER_DEGREE,
  ]
}

/** The arc of a sector on the map, clockwise from `from` to `to`, a point every 5° or so. */
export function sectorArc(center: Position, radiusM: number, from: number, to: number): LineString {
  const span = sweep(from, to)
  const steps = Math.max(2, Math.ceil(span / 5))
  const coordinates = Array.from({ length: steps + 1 }, (_, i) => destination(center, from + (span * i) / steps, radiusM))
  return { type: 'LineString', coordinates }
}

/** The directions of an arc drawn around `center`: from its first point to its last, clockwise. */
export function sectorRange(geometry: LineString, center: Position): { from: number; to: number } | null {
  const coords = geometry.coordinates
  if (coords.length < 2) return null
  return { from: Math.round(bearing(center, coords[0])), to: Math.round(bearing(center, coords[coords.length - 1])) }
}

/**
 * The directions of a sector: those saved with it, which stay true when the
 * terrain's outline (and so its centre) changes, else, for a sector saved
 * before them, read back from its arc.
 */
export function sectorDirections(properties: Record<string, unknown>, geometry: LineString, center: Position): { from: number; to: number } | null {
  const { from_deg: from, to_deg: to } = properties
  if (typeof from === 'number' && typeof to === 'number') return { from: normalize(from), to: normalize(to) }
  return sectorRange(geometry, center)
}

/** Two directions picked on the compass, joined the shorter way round. */
export const shorterWay = (a: number, b: number) => (sweep(a, b) <= 180 ? { from: a, to: b } : { from: b, to: a })

/** Whether a sector goes all around the terrain. */
export const allAround = (from: number, to: number) => sweep(from, to) === 360

/** The radius of the arcs drawn on the map: a little outside the terrain. */
export function arcRadius(bbox: [number, number, number, number] | null | undefined): number {
  if (!bbox) return 60
  const [w, s, e, n] = bbox
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180)
  const half = Math.hypot((e - w) * kx, n - s) * METERS_PER_DEGREE / 2
  return Math.max(15, Math.round(half * 1.15))
}

/**
 * Where the sun rises and sets at the summer and winter solstices
 * (`cos A = sin δ / cos φ`, flat horizon): the summer sun sweeps from its
 * sunrise in the north-east through the south to its sunset in the
 * north-west, the winter sun only across the south. Null above the polar
 * circles, where it does not rise or set every day.
 */
export function sunSectors(latitude: number): { type: SunSectorType; from: number; to: number }[] {
  const tilt = 23.44
  const phi = (latitude * Math.PI) / 180
  const sunrise = (declination: number) => {
    const c = Math.sin((declination * Math.PI) / 180) / Math.cos(phi)
    return Math.abs(c) > 1 ? null : (Math.acos(c) * 180) / Math.PI
  }
  const out: { type: SunSectorType; from: number; to: number }[] = []
  const north = latitude >= 0
  for (const [type, declination] of [['summer_sun', north ? tilt : -tilt], ['winter_sun', north ? -tilt : tilt]] as const) {
    const rise = sunrise(declination)
    if (rise == null) continue
    const r = Math.round(rise)
    // North of the equator the sun turns through the south (clockwise), south of it through the north.
    out.push(north ? { type, from: r, to: 360 - r } : { type, from: 360 - r, to: r })
  }
  return out
}

/**
 * The ring of each arc around the terrain, from the inside out: short arcs
 * close to the terrain, wide ones outside, and two arcs share a ring only
 * where they do not overlap (with `gap` degrees between them for the round
 * ends of the strokes and the labels).
 */
export function packRings(arcs: { from: number; to: number }[], gap = 8): number[] {
  const order = arcs.map((a, i) => ({ i, from: normalize(a.from), span: sweep(a.from, a.to) })).sort((a, b) => a.span - b.span || a.from - b.from)
  const rings: { from: number; span: number }[][] = []
  const result: number[] = new Array(arcs.length).fill(0)
  const overlaps = (a: { from: number; span: number }, b: { from: number; span: number }) => {
    if (a.span + b.span + 2 * gap >= 360) return true
    // b starts inside a (plus the gap), or a inside b.
    const inside = (x: { from: number; span: number }, y: { from: number; span: number }) => normalize(y.from - x.from) < x.span + gap
    return inside(a, b) || inside(b, a)
  }
  for (const arc of order) {
    let ring = rings.findIndex((r) => r.every((other) => !overlaps(arc, other)))
    if (ring === -1) {
      ring = rings.length
      rings.push([])
    }
    rings[ring].push(arc)
    result[arc.i] = ring
  }
  return result
}

/** A label on the lower half of the circle reads right side up when its path runs anticlockwise. */
export const labelReversed = (from: number, to: number) => {
  const mid = normalize(from + sweep(from, to) / 2)
  return mid > 90 && mid < 270
}

/**
 * The SVG path of an arc of radius `r` around (cx, cy), y pointing down,
 * clockwise from `from` to `to`, or the other way round when `reversed`.
 */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number, reversed = false): string {
  const span = Math.min(sweep(from, to), 359.9)
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180
    return `${(cx + r * Math.sin(rad)).toFixed(2)} ${(cy - r * Math.cos(rad)).toFixed(2)}`
  }
  const large = span > 180 ? 1 : 0
  return reversed
    ? `M ${point(from + span)} A ${r} ${r} 0 ${large} 0 ${point(from)}`
    : `M ${point(from)} A ${r} ${r} 0 ${large} 1 ${point(from + span)}`
}

/** The arc length in the same unit as `r`, to tell whether a label fits. */
export const arcLength = (r: number, from: number, to: number) => (r * Math.PI * sweep(from, to)) / 180

/**
 * How the sector page is drawn: the terrain in the middle of a `width` ×
 * `height` picture, `rings` rings of arcs around it, the outermost one
 * still inside the picture. `terrainRadiusM`: the farthest point of the
 * terrain from its centre. Returns the ground scale and, in pixels, the
 * radius of each ring and the width of the strokes.
 */
export function sectorLayout({ width, height, rings, terrainRadiusM }: { width: number; height: number; rings: number; terrainRadiusM: number }) {
  const unit = Math.min(width, height)
  const stroke = Math.round(unit * 0.034)
  const gap = Math.round(stroke * 0.45)
  const margin = Math.round(unit * 0.035)
  const outer = unit / 2 - margin - stroke / 2
  const first = Math.max(unit * 0.16, outer - Math.max(rings - 1, 0) * (stroke + gap))
  // The terrain fits inside the first ring, with a little air.
  const terrainPx = first - stroke / 2 - gap * 1.5
  const metersPerPx = Math.max(terrainRadiusM, 1) / terrainPx
  return { metersPerPx, stroke, radius: (ring: number) => first + ring * (stroke + gap) }
}

/** Ground offset of `point` from `center` in pixels at `metersPerPx` (x east, y down). */
export function toPixels(center: Position, point: Position, metersPerPx: number): [number, number] {
  const kx = Math.cos((center[1] * Math.PI) / 180)
  return [
    ((point[0] - center[0]) * METERS_PER_DEGREE * kx) / metersPerPx,
    (-(point[1] - center[1]) * METERS_PER_DEGREE) / metersPerPx,
  ]
}

/** The farthest of `points` from `center`, in metres. */
export function farthestM(center: Position, points: Position[]): number {
  const kx = Math.cos((center[1] * Math.PI) / 180)
  return points.reduce((max, p) => Math.max(max, Math.hypot((p[0] - center[0]) * kx, p[1] - center[1]) * METERS_PER_DEGREE), 0)
}
