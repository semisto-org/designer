// « Il y a un an, ici »: what happened on this terrain around today's date
// in an earlier year (photos taken, plants put in the ground, elements
// built), so the person sees the seasons come back. The latest year that has
// something wins: a year ago, else two years ago… Read from the map's bundle
// only, so it shows offline too. Pure logic, unit-tested.
import type { MapFeature, Photo } from './types'

/** Days either side of today's date that still count as « this date ». */
export const MEMORY_WINDOW_DAYS = 7
const MAX_PHOTOS = 8

export type Memory = {
  yearsAgo: number
  /** The day of that year that matches today. */
  date: string
  photos: Photo[]
  planted: MapFeature[]
  built: MapFeature[]
}

export function memoryOf({ photos, features, today = new Date() }: { photos: Photo[]; features: MapFeature[]; today?: Date }): Memory | null {
  const years = new Map<number, Memory>()
  const slot = (iso: string): Memory | null => {
    const yearsAgo = yearsBack(iso, today)
    if (yearsAgo === null) return null
    if (!years.has(yearsAgo)) years.set(yearsAgo, { yearsAgo, date: sameDay(today, yearsAgo), photos: [], planted: [], built: [] })
    return years.get(yearsAgo)!
  }
  for (const photo of photos) if (photo.takenAt) slot(photo.takenAt)?.photos.push(photo)
  for (const feature of features) {
    const p = feature.properties
    if (p.status === 'draft' || p.status === 'rejected') continue
    // A planting whose day nobody knows has no date to come back to.
    if (typeof p.planted_on === 'string' && (p.planted_on_precision ?? 'day') === 'day') slot(p.planted_on)?.planted.push(feature)
    if (typeof p.built_on === 'string') slot(p.built_on)?.built.push(feature)
  }
  const latest = [...years.values()].sort((a, b) => a.yearsAgo - b.yearsAgo)[0]
  if (!latest) return null
  // Closest to the day first, so the strip opens on that very day.
  const gap = (iso: string) => Math.abs(dayDiff(iso.slice(0, 10), latest.date))
  latest.photos = latest.photos.sort((a, b) => gap(a.takenAt!) - gap(b.takenAt!) || a.takenAt!.localeCompare(b.takenAt!)).slice(0, MAX_PHOTOS)
  return latest
}

/** How many years before today this date falls on today's date (± the window), or null. */
function yearsBack(iso: string, today: Date): number | null {
  const date = iso.slice(0, 10)
  const years = today.getFullYear() - Number(date.slice(0, 4))
  for (const n of [years, years - 1, years + 1]) {
    if (n < 1) continue
    if (Math.abs(dayDiff(date, sameDay(today, n))) <= MEMORY_WINDOW_DAYS) return n
  }
  return null
}

/** Today's day, n years back (29 February falls on the 28th). */
function sameDay(today: Date, yearsAgo: number): string {
  const year = today.getFullYear() - yearsAgo
  const month = today.getMonth() + 1
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(Math.min(today.getDate(), lastDay))}`
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
}

const pad = (n: number) => String(n).padStart(2, '0')
