import type { RegionLayerData } from '@/types'

/**
 * The aerial photos of a region through time (PhotoArchive on the server):
 * base layers of the « photos » group, each with its year, season and,
 * often, a false colour infrared twin (`options.infrared_of`).
 */
export type Season = 'spring' | 'summer' | 'winter'

export const isPhoto = (layer: RegionLayerData) => layer.category === 'base' && layer.group === 'photos'
export const isInfrared = (layer: RegionLayerData) => typeof layer.options.infrared_of === 'string'
export const yearOf = (layer: RegionLayerData) => (typeof layer.options.year === 'number' ? layer.options.year : null)
export const isLatest = (layer: RegionLayerData) => layer.options.latest === true
export const seasonOf = (layer: RegionLayerData): Season | null => {
  const season = layer.options.season
  return season === 'spring' || season === 'summer' || season === 'winter' ? season : null
}

/** « printemps 2026 », « 1994-2000 », « la plus récente ». */
export function vintageLabel(layer: RegionLayerData): string {
  return typeof layer.options.vintage === 'string' && layer.options.vintage ? layer.options.vintage : layer.name
}

const sortKey = (layer: RegionLayerData) => [isLatest(layer) ? 1 : 0, yearOf(layer) ?? 0, layer.position ?? 0]

function compare(a: RegionLayerData, b: RegionLayerData) {
  const [ka, kb] = [sortKey(a), sortKey(b)]
  for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return ka[i] - kb[i]
  return 0
}

/**
 * The flights of the timeline, oldest first and the « latest » one last,
 * without infrared twins and without the partial flights that do not pass
 * over this map (unless one of them is the photo shown now).
 */
export function photoSteps(layers: RegionLayerData[], uncovered: string[] = [], current: string | null = null): RegionLayerData[] {
  return layers
    .filter((l) => isPhoto(l) && !isInfrared(l))
    .filter((l) => !uncovered.includes(l.key) || l.key === current)
    .sort(compare)
}

/** The infrared twin of each true colour photo, by its key. */
export function infraredTwins(layers: RegionLayerData[]): Map<string, RegionLayerData> {
  const twins = new Map<string, RegionLayerData>()
  layers.forEach((l) => {
    if (isPhoto(l) && isInfrared(l)) twins.set(l.options.infrared_of as string, l)
  })
  return twins
}

/** The true colour photo a base stands for (itself, or the photo an infrared twin belongs to). */
export function trueColourKey(layers: RegionLayerData[], key: string | null): string | null {
  const layer = layers.find((l) => l.key === key)
  if (!layer || !isPhoto(layer)) return null
  return isInfrared(layer) ? (layer.options.infrared_of as string) : layer.key
}

/** How many years ago a flight was, counted from its last year (« 1994-2000 » → 2000); null for the latest. */
export function yearsAgo(layer: RegionLayerData, now: number = new Date().getFullYear()): number | null {
  if (isLatest(layer)) return null
  const years = vintageLabel(layer).match(/\d{4}/g)?.map(Number) ?? []
  const last = years.length ? Math.max(...years) : yearOf(layer)
  return last == null ? null : Math.max(0, now - last)
}
