// « Le carnet des saisons »: the signs a place gives over a year (the first
// frost, where the snow melts first, the puddles after rain, the animals'
// paths, a nest…), each noted where one stands, on the day it is seen. A
// place is read over four seasons: the card « Ton année d'observation »
// shows which ones have been looked at, and each month names the signs worth
// going out for. Saved as the map's `season_sign` notes. Pure logic,
// unit-tested.
import type { MapFeature } from './types'
import { formatDate, seasonOf, t, type Season } from './i18n'

export type SignGroup = 'cold' | 'water' | 'sun_wind' | 'fauna' | 'plants'
export const SIGN_GROUPS: SignGroup[] = ['cold', 'water', 'sun_wind', 'fauna', 'plants']

/** Every sign, with the months (1 to 12) it is worth going out to look for it. */
export const SIGNS = {
  first_frost: { group: 'cold', months: [10, 11] },
  frost_pocket: { group: 'cold', months: [11, 12, 1, 2, 3, 4] },
  last_frost: { group: 'cold', months: [4, 5] },
  snow_melts_first: { group: 'cold', months: [12, 1, 2] },
  snow_lingers: { group: 'cold', months: [12, 1, 2, 3] },
  morning_mist: { group: 'cold', months: [9, 10, 11] },
  puddle: { group: 'water', months: [10, 11, 12, 1, 2, 3] },
  waterlogged: { group: 'water', months: [11, 12, 1, 2, 3] },
  dries_first: { group: 'water', months: [6, 7, 8] },
  winter_sun: { group: 'sun_wind', months: [11, 12, 1, 2] },
  summer_shade: { group: 'sun_wind', months: [6, 7, 8] },
  wind_exposed: { group: 'sun_wind', months: [10, 11, 12, 1, 2, 3] },
  animal_tracks: { group: 'fauna', months: [12, 1, 2, 3] },
  nest: { group: 'fauna', months: [3, 4, 5, 6] },
  browsing: { group: 'fauna', months: [1, 2, 3, 4, 5, 9, 10, 11, 12] },
  pollinators: { group: 'fauna', months: [3, 4, 5, 6, 7, 8] },
  amphibians: { group: 'fauna', months: [2, 3] },
  budburst: { group: 'plants', months: [3, 4] },
  first_flowers: { group: 'plants', months: [2, 3, 4] },
  wild_fruit: { group: 'plants', months: [8, 9, 10] },
  leaf_fall: { group: 'plants', months: [10, 11] },
} as const satisfies Record<string, { group: SignGroup; months: readonly number[] }>

export type Sign = keyof typeof SIGNS
export const SIGN_KEYS = Object.keys(SIGNS) as Sign[]
export const isSign = (value: unknown): value is Sign => typeof value === 'string' && value in SIGNS
export const signsOf = (group: SignGroup): Sign[] => SIGN_KEYS.filter((sign) => SIGNS[sign].group === group)
/** The sign's name, shared with the website's element library. */
export const signLabel = (sign: Sign) => t(`drawing.options.sign.${sign}`)

export const SEASON_SIGN = 'season_sign'
export const SEASONS: Season[] = ['winter', 'spring', 'summer', 'autumn']
/** What counts as a year of observation: the last twelve months. */
const YEAR_DAYS = 365
const DAY = 86_400_000

/** The new element for a sign seen where one stands. */
export function signFeature({ sign, label, text, position, observedAt, accuracy = {} }: {
  sign: Sign; label: string; text: string; position: [number, number]; observedAt: string; accuracy?: Record<string, unknown>
}) {
  return {
    layer: 'notes', kind: SEASON_SIGN,
    name: label,
    notes: text.trim() || null,
    properties: { sign, observed_at: observedAt, ...accuracy },
    geometry: { type: 'Point' as const, coordinates: position },
  }
}

/** When a sign was seen: today, or a day or two back (a frost noticed at noon was the morning's). */
export function observedOn(daysAgo: number, now = new Date()): string {
  const day = new Date(now.getTime() - daysAgo * DAY)
  return daysAgo === 0 ? day.toISOString() : `${isoDay(day)}T08:00:00.000Z`
}

/**
 * « vu il y a 3 jours, le 23 octobre 2026 »: when something was seen, near
 * (to feel the season) and exact (to compare years). Counted in calendar
 * days on the phone, like a plant's age.
 */
export function seenLabel(iso: string, now = new Date()): string {
  const seen = new Date(iso)
  if (Number.isNaN(seen.getTime())) return ''
  const date = formatDate(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(seen)) / DAY)
  if (days <= 0) return days < 0 ? date : t('mobile.season.seen.today')
  if (days === 1) return t('mobile.season.seen.yesterday', { date })
  if (days < 31) return t('mobile.season.seen.days', { count: days, date })
  let months = (now.getFullYear() - seen.getFullYear()) * 12 + now.getMonth() - seen.getMonth()
  if (now.getDate() < seen.getDate()) months--
  months = Math.max(months, 1)
  if (months < 12) return t('mobile.season.seen.months', { count: months, date })
  return t('mobile.season.seen.years', { count: Math.floor(months / 12), date })
}

/** When something was seen on the land, for the kinds that are observations; null for the rest. */
export function observationTime(feature: MapFeature): string | null {
  const p = feature.properties
  if (p.status === 'draft' || p.status === 'rejected') return null
  if (p.kind === SEASON_SIGN || p.kind === 'storm_observation') return stringOrNull(p.observed_at)
  // A note taken during a site visit.
  if (p.kind === 'note_point' && typeof p.visit === 'string') return stringOrNull(p.taken_at)
  return null
}

export type SeasonCount = { season: Season; count: number }

/**
 * The year of observation: how many things were seen on the land in each
 * season over the last twelve months (signs, downpours, visit notes), in the
 * order of the year starting with the current season.
 */
export function observationYear(features: MapFeature[], now = new Date()): SeasonCount[] {
  const counts = new Map<Season, number>(SEASONS.map((season) => [season, 0]))
  for (const feature of features) {
    const time = observationTime(feature)
    if (!time) continue
    const date = new Date(time)
    const age = now.getTime() - date.getTime()
    if (Number.isNaN(age) || age < -DAY || age > YEAR_DAYS * DAY) continue
    const season = seasonOf(date)
    counts.set(season, counts.get(season)! + 1)
  }
  const start = SEASONS.indexOf(seasonOf(now))
  return [...SEASONS.slice(start), ...SEASONS.slice(0, start)].map((season) => ({ season, count: counts.get(season)! }))
}

/** The seasons not yet looked at, in the order they come. */
export const missingSeasons = (year: SeasonCount[]): Season[] => year.filter((s) => s.count === 0).map((s) => s.season)

/**
 * The signs worth going out for this month, those not yet noted this season
 * first, at most `limit`. A sign already noted stays on the list behind the
 * others: a second frost pocket is worth noting too.
 */
export function signsToLookFor(features: MapFeature[], now = new Date(), limit = 3): { sign: Sign; noted: boolean }[] {
  const month = now.getMonth() + 1
  const season = seasonOf(now)
  const notedThisSeason = new Set<Sign>()
  for (const feature of features) {
    if (feature.properties.kind !== SEASON_SIGN || !isSign(feature.properties.sign)) continue
    const time = observationTime(feature)
    if (!time) continue
    const date = new Date(time)
    if (now.getTime() - date.getTime() <= 120 * DAY && seasonOf(date) === season) notedThisSeason.add(feature.properties.sign)
  }
  return SIGN_KEYS
    .filter((sign) => (SIGNS[sign].months as readonly number[]).includes(month))
    .map((sign) => ({ sign, noted: notedThisSeason.has(sign) }))
    .sort((a, b) => Number(a.noted) - Number(b.noted))
    .slice(0, limit)
}

/** The signs of this month, first in the chooser. */
export const signsOfMonth = (now = new Date()): Sign[] =>
  SIGN_KEYS.filter((sign) => (SIGNS[sign].months as readonly number[]).includes(now.getMonth() + 1))

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)
const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
