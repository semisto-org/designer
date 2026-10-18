// The journal of one plant, as a frieze through the years: its planting,
// what was noted (take, flowering, pruning, damage…), its harvests (the
// first one marked) and its photos, newest year first. Pure logic, so it is
// unit-tested; the screen only lays it out.
import type { Survival } from './types'

export const OBSERVATION_KINDS = ['follow_up', 'flowering', 'pruning', 'damage', 'disease', 'intervention', 'other'] as const
export type ObservationKind = (typeof OBSERVATION_KINDS)[number]

export type JournalObservation = {
  key: string; observedOn: string; kind: ObservationKind; survival: Survival | null; vigor: number | null
  note: string | null; author?: string | null; thumb?: string | null; local?: string | null; pending?: boolean
}
export type JournalHarvest = { key: string; notedOn: string; stage: 'on_tree' | 'picked'; amount: string | null; note: string | null }
export type JournalPhoto = { id: number; takenAt: string | null }

export type JournalEntry =
  | { type: 'planted'; key: string; date: string; precision: 'day' | 'year' | 'unknown' }
  | { type: 'observation'; key: string; date: string; observation: JournalObservation }
  | { type: 'harvest'; key: string; date: string; harvest: JournalHarvest; first: boolean }
  | { type: 'photos'; key: string; date: string; ids: number[] }

/** One year of the plant's life: its age then (year 1 = the year it went in), its entries newest first. */
export type JournalYear = { year: number; age: number | null; entries: JournalEntry[] }

export function journalOf({ plantedOn, precision = 'day', observations, harvests, photos }: {
  plantedOn: string | null | undefined; precision?: 'day' | 'year' | 'unknown' | null
  observations: JournalObservation[]; harvests: JournalHarvest[]; photos: JournalPhoto[]
}): JournalYear[] {
  const entries: JournalEntry[] = []
  // A plant in the ground since a date nobody knows has no place on the frieze.
  if (plantedOn && precision !== 'unknown') entries.push({ type: 'planted', key: 'planted', date: day(plantedOn), precision: precision ?? 'day' })
  for (const observation of observations) entries.push({ type: 'observation', key: `o${observation.key}`, date: day(observation.observedOn), observation })

  // The first fruit picked: « Première récolte », a date to remember.
  const firstFruit = [...harvests]
    .filter((h) => h.stage === 'picked')
    .sort((a, b) => day(a.notedOn).localeCompare(day(b.notedOn)))[0]
  for (const harvest of harvests) {
    entries.push({ type: 'harvest', key: `h${harvest.key}`, date: day(harvest.notedOn), harvest, first: harvest === firstFruit })
  }

  // Photos of one day make one entry.
  const byDay = new Map<string, number[]>()
  for (const photo of photos) {
    if (!photo.takenAt) continue
    const date = day(photo.takenAt)
    byDay.set(date, [...(byDay.get(date) ?? []), photo.id])
  }
  byDay.forEach((ids, date) => entries.push({ type: 'photos', key: `p${date}`, date, ids }))

  const plantedYear = plantedOn && precision !== 'unknown' ? Number(day(plantedOn).slice(0, 4)) : null
  const years = new Map<number, JournalEntry[]>()
  for (const entry of entries) {
    const year = Number(entry.date.slice(0, 4))
    years.set(year, [...(years.get(year) ?? []), entry])
  }
  return [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, list]) => ({
      year,
      age: plantedYear !== null && year >= plantedYear ? year - plantedYear + 1 : null,
      // Newest first; on one day, the planting comes last (it happened first).
      entries: list.sort((a, b) => b.date.localeCompare(a.date) || (a.type === 'planted' ? 1 : b.type === 'planted' ? -1 : 0)),
    }))
}

/** What a new entry needs before it can be sent: a take for a follow-up, words for « Autre ». */
export function entryReady(kind: ObservationKind, survival: Survival | null, note: string): boolean {
  if (kind === 'follow_up') return survival !== null
  if (kind === 'other') return note.trim().length > 0
  return true
}

function day(iso: string): string {
  return iso.slice(0, 10)
}
