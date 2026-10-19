// A quick survey of the wild plants of one patch: each photo says which
// organ it shows (Pl@ntNet reads a flower better when it knows it is one),
// each plant noted gets the share of the patch it covers, and the plants
// noted so far add up to a reading of the soil, weighted by their cover.
// Pure, so it is tested without a phone.

export const ORGANS = ['auto', 'leaf', 'flower', 'fruit', 'bark', 'habit'] as const
export type Organ = (typeof ORGANS)[number]

/** Cover classes, as a botanist notes them by eye; `percent` is the class midpoint sent to the server. */
export const COVERS = [
  { key: 'under_5', percent: 2 },
  { key: 'to_25', percent: 15 },
  { key: 'to_50', percent: 37 },
  { key: 'to_75', percent: 62 },
  { key: 'over_75', percent: 87 },
] as const
export type CoverKey = (typeof COVERS)[number]['key']

export type Abundance = 'rare' | 'present' | 'frequent' | 'dominant'

/** The same thresholds as the server (`BioindicatorObservation.abundance_for_cover`). */
export function abundanceForCover(percent: number): Abundance {
  if (percent < 5) return 'rare'
  if (percent < 25) return 'present'
  if (percent < 50) return 'frequent'
  return 'dominant'
}

export const coverPercent = (key: CoverKey) => COVERS.find((c) => c.key === key)!.percent

/** The organ after this one, for a tap on a photo that cycles through them. */
export const nextOrgan = (organ: Organ): Organ => ORGANS[(ORGANS.indexOf(organ) + 1) % ORGANS.length]

export type NotedPlant = { name: string; coverPercent: number; indicates: string[]; unverified: string[] }

export type ReadingLine = {
  key: string
  /** Share of the noted cover that points to this, 0 to 100. */
  share: number
  plants: string[]
  /** Every plant that says it marks it as not yet verified. */
  unverified: boolean
}

/**
 * What the plants noted so far say about the soil: one line per indicator,
 * weighted by the cover of the plants that show it, strongest first. A plant
 * outside the list still counts in the total cover, so a patch of grass with
 * one nettle does not read as a rich soil.
 */
export function surveyReading(plants: NotedPlant[]): ReadingLine[] {
  const total = plants.reduce((sum, p) => sum + p.coverPercent, 0)
  if (total === 0) return []
  const lines = new Map<string, { weight: number; plants: string[]; verified: boolean }>()
  for (const plant of plants) {
    for (const key of new Set(plant.indicates)) {
      const line = lines.get(key) ?? { weight: 0, plants: [], verified: false }
      line.weight += plant.coverPercent
      line.plants.push(plant.name)
      line.verified ||= !plant.unverified.includes(key)
      lines.set(key, line)
    }
  }
  return [...lines.entries()]
    .map(([key, line]) => ({ key, share: Math.round((line.weight / total) * 100), plants: line.plants, unverified: !line.verified, weight: line.weight }))
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .map(({ weight: _weight, ...line }) => line)
}

/** Whether Pl@ntNet's candidate is a species the map's palette already holds. */
export function inPalette(speciesId: number | null | undefined, palette: { speciesId: number }[] | undefined): boolean {
  return speciesId != null && (palette ?? []).some((entry) => entry.speciesId === speciesId)
}
