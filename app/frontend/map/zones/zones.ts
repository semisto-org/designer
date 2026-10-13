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

/** Corner-cutting passes: three turn a square into a soft, hand-drawn blob. */
const SMOOTH_PASSES = 3

function chaikin(points: Position[], closed: boolean): Position[] {
  const cut = (p: Position, q: Position, t: number) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
  let current = closed ? points.slice(0, -1) : points
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const next: Position[] = closed ? [] : [current[0]]
    const edges = closed ? current.length : current.length - 1
    for (let i = 0; i < edges; i++) {
      const p = current[i]
      const q = current[(i + 1) % current.length]
      next.push(cut(p, q, 0.25), cut(p, q, 0.75))
    }
    if (!closed) next.push(current[current.length - 1])
    current = next
  }
  return closed ? [...current, current[0]] : current
}

/**
 * The outline drawn on the map for a zone with `rounded: true`: its corners
 * cut again and again (Chaikin) into curves, the way a designer draws a
 * zone by hand. The stored geometry keeps the clicked points, which stay
 * the ones edited; the area written on the map is the rounded one's.
 */
export function roundedGeometry(geometry: Geometry): Geometry {
  const ring = (r: Position[]) => (r.length >= 4 ? chaikin(r, true) : r)
  const line = (l: Position[]) => (l.length >= 3 ? chaikin(l, false) : l)
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
