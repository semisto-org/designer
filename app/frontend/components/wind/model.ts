// Types and pure helpers for the wind of a map's place (GET /maps/:id/wind,
// Wind::MapReport): thirty years of ERA5-Land 10 m wind as roses, the
// person's « Le vent frappe ici » signs and the map's wind sectors.
// No React and no '@/' imports, so node can test them.

export type RoseSector = { deg: number; pct: number; meanKmh: number | null; classes: number[] }
export type Rose = { hours: number; calmPct: number; meanKmh: number; prevailingDeg: number; sectors: RoseSector[] }
export type Share = { deg: number; pct: number }
export type WindRoses = {
  classesKmh: number[]
  year: Rose
  seasons: { winter: Rose | null; spring: Rose | null; summer: Rose | null; autumn: Rose | null }
  coldSpring: { coldC: number; minKmh: number; hoursPct: number; prevailingDeg: number | null; northEastPct: number; sectors: Share[] } | null
  strong: { percentile: number; thresholdKmh: number; maxKmh: number; prevailingDeg: number | null; sectors: Share[] }
}
export type WindSign = { id: number; observedAt?: string; windFromDeg?: number; notes?: string; position?: [number, number] }
export type WindSector = { id: number; type: 'wind' | 'cold_wind'; season: string; fromDeg?: number; toDeg?: number; name?: string; status: string }

export type WindReport =
  | { available: false; reason: 'not_configured' | 'no_location' }
  | {
      available: true
      status: 'pending' | 'ready' | 'failed'
      scale: { gridKm: number; windGridKm: number }
      period: { firstYear: number; lastYear: number }
      rose: WindRoses | null
      signs: WindSign[]
      sectors: WindSector[]
      source: { publisher: string; licence: string; url: string; year: number }
    }

/** What a rose shows: a season's winds, the cold spring wind or the strongest hours. */
export const WIND_VIEWS = ['year', 'winter', 'spring', 'summer', 'autumn', 'cold_spring', 'strong'] as const
export type WindView = (typeof WIND_VIEWS)[number]

/** The petals of a view: share of hours per direction (16, from north), with speed classes when known. */
export function petalsOf(roses: WindRoses, view: WindView): { deg: number; pct: number; classes: number[] | null }[] {
  if (view === 'cold_spring') return (roses.coldSpring?.sectors ?? []).map((s) => ({ ...s, classes: null }))
  if (view === 'strong') return roses.strong.sectors.map((s) => ({ ...s, classes: null }))
  const rose = view === 'year' ? roses.year : roses.seasons[view]
  return (rose?.sectors ?? []).map((s) => ({ deg: s.deg, pct: s.pct, classes: s.classes }))
}

/** Where the wind of a view mostly comes from, or null. */
export function prevailingOf(roses: WindRoses, view: WindView): number | null {
  if (view === 'cold_spring') return roses.coldSpring?.prevailingDeg ?? null
  if (view === 'strong') return roses.strong.prevailingDeg
  const rose = view === 'year' ? roses.year : roses.seasons[view]
  return rose?.prevailingDeg ?? null
}

/** The rose a sector season filter (« Secteurs » panel) looks at. */
export function viewForSeason(season: 'all' | 'winter' | 'spring' | 'summer'): WindView {
  return season === 'all' ? 'year' : season
}

/**
 * The three directions (67.5°) around where a wind mostly comes from: the
 * span a sector proposed from the rose starts with. Snapped to the 16
 * compass points of the sector compass.
 */
export function sectorAround(deg: number): { from: number; to: number } {
  const snap = (d: number) => ((Math.round(d / 22.5) * 22.5) % 360 + 360) % 360
  return { from: snap(deg - 22.5), to: snap(deg + 22.5) }
}

/** Index (0-15, from north clockwise) of the compass point a direction falls in. */
export const pointIndex = (deg: number) => Math.floor((((deg % 360) + 360) % 360 + 11.25) / 22.5) % 16
