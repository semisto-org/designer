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
