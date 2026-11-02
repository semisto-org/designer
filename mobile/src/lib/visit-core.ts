// A walk on the land (« visite de terrain »), pure so it is tested. Notes
// taken on the way are note points carrying the visit's key and a theme:
// the themes Semisto's designers write down on every first visit. The
// server groups them into the visit's report (SiteVisit).
import type { MapBundle, MapFeature } from './types'

export const THEMES = ['wish', 'water', 'soil', 'tree', 'fauna', 'climate', 'neighbours', 'history', 'question'] as const
export type Theme = (typeof THEMES)[number]
export const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme)

/**
 * What the phone records of the walk, besides the notes, when the person
 * asks for it: the sound (`audio`: where the file is, and when it began)
 * and the GPS track (`tracking`: whether it is on). Both are optional and
 * can be paused; they end with the visit.
 */
export type VisitAudio = { file: string | null; startedAt: string }
export type Visit = { key: string; startedAt: string; audio?: VisitAudio | null; tracking?: boolean }

/** A note's title fits on one line of the map's lists; the full text goes in its notes. */
export const TITLE_MAX = 80

export function noteFeature(text: string, theme: Theme | null, visit: Visit, position: [number, number], takenAt = new Date().toISOString()) {
  const clean = text.trim()
  const oneLine = clean.replace(/\s+/g, ' ')
  const name = oneLine.length > TITLE_MAX ? `${oneLine.slice(0, TITLE_MAX - 1).trimEnd()}…` : oneLine
  return {
    layer: 'notes', kind: 'note_point',
    name: name || null,
    notes: oneLine.length > TITLE_MAX ? clean : null,
    properties: { visit: visit.key, taken_at: takenAt, ...(theme ? { theme } : {}) },
    geometry: { type: 'Point' as const, coordinates: position },
  }
}

/** The notes of a visit, in the order they were taken. */
export function visitNotes(bundle: MapBundle, key: string): MapFeature[] {
  return bundle.features
    .filter((f) => f.properties.layer === 'notes' && f.properties.visit === key && f.properties.status !== 'rejected')
    .sort((a, b) => noteTime(a).localeCompare(noteTime(b)) || Math.abs(a.id) - Math.abs(b.id))
}

const noteTime = (f: MapFeature) => String(f.properties.taken_at ?? f.properties.updatedAt ?? '')

export const themeOf = (feature: MapFeature): Theme | null => (isTheme(feature.properties.theme) ? feature.properties.theme : null)

/** How many notes per theme, in the order of THEMES; the notes with none count as `other`. */
export function countByTheme(notes: MapFeature[]): { theme: Theme | 'other'; count: number }[] {
  const counts = new Map<Theme | 'other', number>()
  for (const note of notes) {
    const theme = themeOf(note) ?? 'other'
    counts.set(theme, (counts.get(theme) ?? 0) + 1)
  }
  return [...THEMES, 'other' as const].filter((theme) => counts.has(theme)).map((theme) => ({ theme, count: counts.get(theme)! }))
}

export const questionsOf = (notes: MapFeature[]) => notes.filter((note) => themeOf(note) === 'question')

/** How long the walk has lasted, in whole minutes. */
export function minutesSince(startedAt: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60_000))
}

/** « 02/11/2026 »: the day the visit began, as its recording is titled in the documents. */
export function visitDay(startedAt: string): string {
  const day = new Date(startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(day.getDate())}/${pad(day.getMonth() + 1)}/${day.getFullYear()}`
}

/** « 0:42 », « 12:05 », « 1:02:09 »: how long the sound has been recording. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** « 350 m », « 1,2 km »: how far the walk has gone. */
export function walked(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}
