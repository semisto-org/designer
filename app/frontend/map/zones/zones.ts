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

/** How far a corner is rounded: a share of its shorter edge, never more than a few metres. */
const CORNER_SHARE = 0.15
const CORNER_MAX_M = 3
/** Segments of each rounded corner: enough to read as a curve at plan zoom. */
const CORNER_STEPS = 6
const M_PER_DEG = 111_320

/**
 * Softens each corner with a small curve (a quadratic Bézier through the
 * clicked vertex), the edges between them left straight. Distances are
 * measured in local metres so the curve is round on the ground, and the
 * radius stays small: a right-angled corner of 3 m loses about 3 m².
 */
function softenCorners(points: Position[], closed: boolean): Position[] {
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
    const r = Math.min(CORNER_SHARE * Math.min(lp, ln), CORNER_MAX_M)
    if (!(r > 0)) {
      out.push(v)
      continue
    }
    const a = toward(v, prev, r, lp)
    const b = toward(v, next, r, ln)
    for (let s = 0; s <= CORNER_STEPS; s++) {
      const t = s / CORNER_STEPS
      const u = 1 - t
      out.push([u * u * a[0] + 2 * u * t * v[0] + t * t * b[0], u * u * a[1] + 2 * u * t * v[1] + t * t * b[1]])
    }
  }
  return closed ? [...out, out[0]] : out
}

/**
 * The outline drawn on the map for a zone with `rounded: true`: its corners
 * softened by a small curve, the edges kept straight, so the area barely
 * moves. The stored geometry keeps the clicked points, which stay the ones
 * edited; the area written on the map is the rounded one's.
 */
export function roundedGeometry(geometry: Geometry): Geometry {
  const ring = (r: Position[]) => (r.length >= 4 ? softenCorners(r, true) : r)
  const line = (l: Position[]) => (l.length >= 3 ? softenCorners(l, false) : l)
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

/** Whether a feature is a zone drawn with rounded corners. */
export function isRoundedZone(properties: { kind?: unknown; rounded?: unknown } | null | undefined): boolean {
  return isZoneKind(properties?.kind) && properties?.rounded === true
}
