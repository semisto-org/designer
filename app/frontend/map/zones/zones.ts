/**
 * Named, coloured zones of a design: the surfaces and lines a designer
 * draws to show a client where things go (« Forêt-jardin en strates
 * hautes, 20 ares », « Haie persistante multirangs, 145 m »). They are the
 * editor's generic `zone` (surface) and `line` (path) kinds, free of the
 * element library: any colour, a name written on the map, their measure
 * under it.
 *
 * Pure helpers, shared by the map layers, the toolbar and the inspector.
 */

import type { Geometry } from 'geojson'

export const ZONE_KINDS = ['zone', 'line'] as const
export type ZoneKind = (typeof ZONE_KINDS)[number]

export function isZoneKind(kind: unknown): kind is ZoneKind {
  return (ZONE_KINDS as readonly unknown[]).includes(kind)
}

/**
 * Soft watercolour tones that stay readable at 40 % over an aerial photo
 * and tell neighbouring zones apart: meadow green, earth, ochre, old rose,
 * slate blue, lilac, mustard, teal.
 */
export const ZONE_COLORS = ['#7fa650', '#8b5e3c', '#d08b3a', '#c48a96', '#5b7fa6', '#9a7fb8', '#c9b03a', '#4f8f86']

/** Fill opacity of a zone: the ground stays visible through it. */
export const ZONE_FILL_OPACITY = 0.42

/** The colour a new zone starts with: the least used one, in palette order. */
export function nextZoneColor(used: readonly string[]): string {
  const counts = new Map(ZONE_COLORS.map((c) => [c, 0]))
  for (const color of used) {
    const key = color.toLowerCase()
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1)
  }
  let best = ZONE_COLORS[0]
  for (const color of ZONE_COLORS) if (counts.get(color)! < counts.get(best)!) best = color
  return best
}

const NBSP = ' '
const number = (value: number, digits: number) => new Intl.NumberFormat('fr-BE', { maximumFractionDigits: digits }).format(value)

/**
 * A zone's area the way designers write it on a plan: square metres for a
 * small bed, ares for a garden, hectares beyond.
 */
export function zoneAreaText(m2: number): string {
  if (m2 < 1000) return `${number(Math.round(m2), 0)}${NBSP}m²`
  if (m2 < 10_000) return `${number(m2 / 100, 1)}${NBSP}ares`
  return `${number(m2 / 10_000, 2)}${NBSP}ha`
}

/** A path's length: to the decimetre when short, then metres, then kilometres. */
export function zoneLengthText(m: number): string {
  if (m < 10) return `${number(m, 1)}${NBSP}m`
  if (m < 1000) return `${number(Math.round(m), 0)}${NBSP}m`
  return `${number(m / 1000, 2)}${NBSP}km`
}

/**
 * The measure written under a zone's name, or null when it is hidden
 * (`show_measure: false`) or there is nothing to measure.
 */
export function zoneMeasureText(
  properties: { kind?: unknown; show_measure?: unknown },
  measure: { area: number | null; length: number | null },
): string | null {
  if (!isZoneKind(properties.kind) || properties.show_measure === false) return null
  if (properties.kind === 'zone') return measure.area != null && measure.area > 0 ? zoneAreaText(measure.area) : null
  return measure.length != null && measure.length > 0 ? zoneLengthText(measure.length) : null
}

type Position = number[]

/**
 * How strongly corners are rounded (`rounding`), from 1 (a hint) to 10 (as
 * round as the outline allows). Level 3 is the default: 15 % of the shorter
 * edge, 3 m at most, the soft corner of a zone drawn by hand.
 */
export const ROUNDING_MIN = 1
export const ROUNDING_MAX = 10
export const ROUNDING_DEFAULT = 3
/** Segments of a rounded corner: enough to read as a curve at plan zoom, more for a wide one. */
const CORNER_STEPS = 6
const CORNER_STEPS_MAX = 24
const M_PER_DEG = 111_320

/** The rounding level of a feature: its `rounding`, else the default, kept within bounds. */
export function roundingLevel(properties: object | null | undefined): number {
  const raw = (properties as { rounding?: unknown } | null | undefined)?.rounding
  const level = Number(raw)
  if (raw == null || !Number.isFinite(level)) return ROUNDING_DEFAULT
  return Math.min(ROUNDING_MAX, Math.max(ROUNDING_MIN, Math.round(level)))
}

/**
 * A level's corner: its share of the shorter edge (5 % per level, so half
 * the edge at 10, where neighbouring curves meet) and its radius cap in
 * metres, which grows fast so a strongly rounded pond turns oval.
 */
function cornerOf(level: number): { share: number; maxM: number } {
  return { share: 0.05 * level, maxM: 3 * (level / ROUNDING_DEFAULT) ** 2 }
}

/**
 * Softens each corner with a small curve (a quadratic Bézier through the
 * clicked vertex), the edges between them left straight. Distances are
 * measured in local metres so the curve is round on the ground, and at the
 * default level the radius stays small: a right-angled corner of 3 m loses
 * about 3 m².
 */
function softenCorners(points: Position[], closed: boolean, level: number): Position[] {
  const { share, maxM } = cornerOf(level)
  const ring = closed ? points.slice(0, -1) : points
  const n = ring.length
  if (n < 3) return points
  const kx = Math.cos((ring[0][1] * Math.PI) / 180) * M_PER_DEG
  const metres = (p: Position, q: Position) => Math.hypot((q[0] - p[0]) * kx, (q[1] - p[1]) * M_PER_DEG)
  const toward = (v: Position, p: Position, d: number, len: number) => [v[0] + ((p[0] - v[0]) * d) / len, v[1] + ((p[1] - v[1]) * d) / len]
  const out: Position[] = []
  for (let i = 0; i < n; i++) {
    const v = ring[i]
    const isEnd = !closed && (i === 0 || i === n - 1)
    if (isEnd) {
      out.push(v)
      continue
    }
    const prev = ring[(i - 1 + n) % n]
    const next = ring[(i + 1) % n]
    const lp = metres(v, prev)
    const ln = metres(v, next)
    const r = Math.min(share * Math.min(lp, ln), maxM)
    if (!(r > 0)) {
      out.push(v)
      continue
    }
    const a = toward(v, prev, r, lp)
    const b = toward(v, next, r, ln)
    const steps = Math.min(CORNER_STEPS_MAX, Math.max(CORNER_STEPS, Math.ceil(r)))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const u = 1 - t
      out.push([u * u * a[0] + 2 * u * t * v[0] + t * t * b[0], u * u * a[1] + 2 * u * t * v[1] + t * t * b[1]])
    }
  }
  return closed ? [...out, out[0]] : out
}

/**
 * The outline drawn on the map for a feature with `rounded: true`: its
 * corners softened by a curve as strong as its level, the edges kept
 * straight between them. The stored geometry keeps the clicked points,
 * which stay the ones edited; the area shown is the rounded one's.
 */
export function roundedGeometry(geometry: Geometry, level: number = ROUNDING_DEFAULT): Geometry {
  const ring = (r: Position[]) => (r.length >= 4 ? softenCorners(r, true, level) : r)
  const line = (l: Position[]) => (l.length >= 3 ? softenCorners(l, false, level) : l)
  switch (geometry.type) {
    case 'Polygon':
      return { ...geometry, coordinates: geometry.coordinates.map(ring) }
    case 'MultiPolygon':
      return { ...geometry, coordinates: geometry.coordinates.map((p) => p.map(ring)) }
    case 'LineString':
      return { ...geometry, coordinates: line(geometry.coordinates) }
    case 'MultiLineString':
      return { ...geometry, coordinates: geometry.coordinates.map(line) }
    default:
      return geometry
  }
}

/**
 * Whether a feature is drawn with rounded corners: a zone, or any surface
 * (a pond, a bed…), that asks for it.
 */
export function isRounded(properties: object | null | undefined): boolean {
  return (properties as { rounded?: unknown } | null | undefined)?.rounded === true
}

/** The geometry a feature is drawn and measured with: rounded when it asks for it. */
export function displayGeometry(feature: { geometry: Geometry; properties: object | null }): Geometry {
  return isRounded(feature.properties) ? roundedGeometry(feature.geometry, roundingLevel(feature.properties)) : feature.geometry
}
