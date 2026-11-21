/**
 * « Ce que le lieu dit »: the notes the drawn view writes in the margin of
 * the base plan, so the constraints stay under the pencil while one
 * designs. Pure, tested in test/frontend/drawn.
 */

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn']

/** The season of a date, as MapFeature::SeasonSign.season_of: winter is December to February. */
export function seasonOf(date: Date): Season {
  return SEASONS[Math.floor((date.getUTCMonth() + 1) % 12 / 3)]
}

export type MarginInput = {
  /** Challenges of the place from the functional analysis. */
  placeChallenges: string[]
  /** The project's functions and how well the design serves them. */
  functions: Array<{ name: string; status: 'missing' | 'fragile' | 'covered' }>
  /** Sectors noted on the map (sun, wind, risks…). */
  sectorCount: number
  /** When the person noted a season sign or a downpour on the land (ISO dates). */
  observedAt: string[]
  now: Date
}

export type MarginNotes = {
  challenges: string[]
  unserved: string[]
  sectorCount: number
  /** Seasons never observed on the land in the last twelve months. */
  missingSeasons: Season[]
  /** How many notes the margin holds, for the folded pill. */
  count: number
}

const MAX_LINES = 3

export function marginNotes(input: MarginInput): MarginNotes {
  const challenges = input.placeChallenges.map((c) => c.trim()).filter(Boolean).slice(0, MAX_LINES)
  const unserved = input.functions.filter((f) => f.status === 'missing').map((f) => f.name).slice(0, MAX_LINES)
  const since = input.now.getTime() - 365 * 24 * 3600 * 1000
  const seen = new Set<Season>()
  for (const value of input.observedAt) {
    const date = new Date(value)
    const time = date.getTime()
    if (Number.isNaN(time) || time < since || time > input.now.getTime() + 24 * 3600 * 1000) continue
    seen.add(seasonOf(date))
  }
  const missingSeasons = SEASONS.filter((s) => !seen.has(s))
  const count = challenges.length + unserved.length + (input.sectorCount > 0 ? 1 : 0) + (missingSeasons.length ? 1 : 0)
  return { challenges, unserved, sectorCount: input.sectorCount, missingSeasons, count }
}
