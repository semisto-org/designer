// The moment the editor map shows, along the time strip at its foot:
// the land on arrival, today, then 5, 15 and 30 years into the garden.
// Pure functions (no React, no MapLibre), tested in test/frontend/time.
//
// - arrival: the land as it was when the map was made: what Terranova
//   records as planted or built since then is left out, and so is every
//   project and draft;
// - today: what is in the ground, each crown at its real age, and the plan
//   drawn apart (dashed, at its adult footprint); an AI's drafts wait for
//   the future;
// - year5 / year15 / year30: the garden that many years after its first
//   planting, planned plants put in the ground at the next planting season,
//   drafts included.

import { isPlanned, isPlannedPlant, PLANNED_EXPR } from '../scenario.ts'

export type Moment = 'arrival' | 'today' | 'year5' | 'year15' | 'year30'
export type FutureMoment = 'year5' | 'year15' | 'year30'

export const MOMENTS: readonly Moment[] = ['arrival', 'today', 'year5', 'year15', 'year30']
export const FUTURE_YEARS: Record<FutureMoment, number> = { year5: 5, year15: 15, year30: 30 }
export const DEFAULT_MOMENT: Moment = 'today'

export function parseMoment(value: unknown): Moment {
  return MOMENTS.includes(value as Moment) ? (value as Moment) : DEFAULT_MOMENT
}

export function isFuture(moment: Moment): moment is FutureMoment {
  return moment in FUTURE_YEARS
}

/** The dates the strip is drawn from (ISO days). */
export type Timeline = {
  today: string
  /** When the map was made: the land « on arrival ». */
  arrival: string
  /** The next planting season (bare-root, November to March): when a planned plant goes into the ground. */
  nextSeason: string
  /** Year 0 of the garden: its first planting since arrival, else the next planting season. */
  origin: string
}

type Properties = Record<string, unknown> | null | undefined

const DAY_MS = 86_400_000
const YEAR_DAYS = 365.25

/** Years from `from` to `to` (ISO dates), fractional. */
export function yearsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS / YEAR_DAYS
}

/** `date` plus whole years (ISO day; 29 February becomes 1 March). */
export function addYears(date: string, years: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

/**
 * Bare-root trees and bushes go into the ground from November to March:
 * today when it is the season, else the coming 1 November.
 */
export function nextPlantingSeason(today: string): string {
  const month = Number(today.slice(5, 7))
  if (month >= 11 || month <= 3) return today.slice(0, 10)
  return `${today.slice(0, 4)}-11-01`
}

/** In the ground since a date nobody knows (an old tree found on the land). */
export function plantedLongAgo(properties: Properties): boolean {
  return properties?.planted_on_precision === 'unknown'
}

/** A known planting date (ISO day), or null for a planned plant or one planted long ago. */
export function plantedOn(properties: Properties): string | null {
  const value = properties?.planted_on
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value) || plantedLongAgo(properties)) return null
  return value.slice(0, 10)
}

function builtOn(properties: Properties): string | null {
  const value = properties?.built_on
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
}

const isPlantPoint = (properties: Properties) => properties?.layer === 'plants' && properties?.kind === 'plant'

/** The strip's dates for a map made on `arrival`, from its features' properties. */
export function timeline(features: Properties[], today: string, arrival: string): Timeline {
  const day = today.slice(0, 10)
  const arrived = arrival.slice(0, 10)
  const nextSeason = nextPlantingSeason(day)
  let first: string | null = null
  for (const properties of features) {
    if (!isPlantPoint(properties) || properties?.status !== 'active') continue
    const date = plantedOn(properties)
    if (date && date >= arrived && (!first || date < first)) first = date
  }
  return { today: day, arrival: arrived, nextSeason, origin: first ?? nextSeason }
}

/** The day a moment shows. */
export function momentDate(moment: Moment, line: Timeline): string {
  if (moment === 'arrival') return line.arrival
  if (moment === 'today') return line.today
  return addYears(line.origin, FUTURE_YEARS[moment])
}

/**
 * The stops the strip offers: arrival and today always, and the years of
 * the garden still to come (an old garden's year 5 is already behind it).
 */
export function availableMoments(line: Timeline): Moment[] {
  return MOMENTS.filter((moment) => !isFuture(moment) || momentDate(moment, line) > line.today)
}

/** The moment to show: the one asked for, or today when it has passed. */
export function shownMoment(moment: Moment, line: Timeline): Moment {
  return availableMoments(line).includes(moment) ? moment : DEFAULT_MOMENT
}

/** Whether a feature is on the map at this moment (rejected features are the caller's business). */
export function inMoment(properties: Properties, moment: Moment, arrival: string): boolean {
  if (properties?.status === 'draft') return isFuture(moment)
  if (moment !== 'arrival') return true
  if (isPlanned(properties)) return false
  const planted = plantedOn(properties)
  if (isPlantPoint(properties) && planted && planted >= arrival) return false
  const built = builtOn(properties)
  return !(built && built >= arrival)
}

const DATE_EXPR = (key: string) => ['slice', ['to-string', ['coalesce', ['get', key], '']], 0, 10]

/** MapLibre filter twin of inMoment, or null when the moment shows everything. */
export function momentFilter(moment: Moment, arrival: string): unknown[] | null {
  if (isFuture(moment)) return null
  const notDraft = ['!=', ['coalesce', ['get', 'status'], 'active'], 'draft']
  if (moment === 'today') return notDraft
  const plantedSince = [
    'all',
    ['==', ['get', 'layer'], 'plants'],
    ['==', ['get', 'kind'], 'plant'],
    ['!=', ['coalesce', ['get', 'planted_on_precision'], ''], 'unknown'],
    ['>=', DATE_EXPR('planted_on'), arrival],
  ]
  const builtSince = ['>=', DATE_EXPR('built_on'), arrival]
  return ['all', notDraft, ['!', PLANNED_EXPR], ['!', plantedSince], ['!', builtSince]]
}

/**
 * A plant's age at this moment (years), for the growth model:
 * - 'adult' for a tree in the ground since long ago, and for a planned plant
 *   today (the plan's footprint, drawn dashed);
 * - null when it is not in the ground at that moment;
 * - else its years since planting (a planned plant goes in at the next
 *   planting season), 0 for one planted later than the moment.
 */
export function plantAge(properties: Properties, moment: Moment, line: Timeline): number | 'adult' | null {
  if (plantedLongAgo(properties)) return 'adult'
  const date = momentDate(moment, line)
  if (isPlannedPlant(properties)) {
    if (moment === 'arrival') return null
    if (moment === 'today') return 'adult'
    return Math.max(0, yearsBetween(line.nextSeason, date))
  }
  const planted = plantedOn(properties)
  if (!planted) return 'adult'
  const age = yearsBetween(planted, date)
  if (age < 0) return moment === 'arrival' ? null : 0
  return age
}
