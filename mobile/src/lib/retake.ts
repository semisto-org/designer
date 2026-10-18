// A photo taken again from the same spot (« Reprendre cette photo »): last
// year's photo shown faintly over the camera, the way ReShoot and GrassSnap
// guide a repeat photo, then the two side by side. A series is the first
// photo and its retakes (MapPhoto#retake_of on the server). Pure, so it is
// tested.
import { bearing, distance } from './geo'
import { t } from './i18n'
import { compass, type Direction } from './terrain'
import type { Photo, Position } from './types'

const DAY = 24 * 60 * 60 * 1000

const when = (photo: Photo) => photo.takenAt ?? ''

/** The first photo and its retakes, oldest first (videos are never retaken). */
export function seriesOf(photos: Photo[], photo: Photo): Photo[] {
  const first = photo.retakeOfId ?? photo.id
  const series = photos.filter((p) => p.kind !== 'video' && (p.id === first || p.retakeOfId === first))
  if (!series.some((p) => p.id === photo.id)) series.push(photo)
  return series.sort((a, b) => when(a).localeCompare(when(b)) || a.id - b.id)
}

/** « 6 mois plus tard », « 1 an et demi plus tard », « 3 ans plus tard ». */
export function elapsed(fromIso: string | null, toIso: string | null): string | null {
  if (!fromIso || !toIso) return null
  const from = new Date(fromIso)
  const to = new Date(toIso)
  const days = Math.round((to.getTime() - from.getTime()) / DAY)
  if (days < 1) return t('mobile.retake.elapsed.same_day')
  const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() - (to.getDate() < from.getDate() ? 1 : 0)
  if (months < 1) return t('mobile.retake.elapsed.days', { count: days })
  if (months < 12) return t('mobile.retake.elapsed.months', { count: months })
  const years = Math.floor(months / 12)
  return t(months % 12 >= 6 ? 'mobile.retake.elapsed.years_half' : 'mobile.retake.elapsed.years', { count: years })
}

export type Guide =
  | { step: 'free' }
  | { step: 'locating' }
  | { step: 'walk'; meters: number; bearing: number; direction: Direction }
  | { step: 'turn'; degrees: number }
  | { step: 'ready' }

/** Facing within this many degrees of the first photo is close enough. */
export const HEADING_TOLERANCE = 15

/**
 * What to do to stand where the first photo was taken: walk there, then
 * turn to face the same way. `free` when the first photo was never placed:
 * the faint photo alone guides the eye.
 */
export function guide(origin: Photo, me: Position | null, accuracy: number | null, heading: number | null): Guide {
  if (origin.lng === null || origin.lat === null) return { step: 'free' }
  if (!me) return { step: 'locating' }
  const spot: Position = [origin.lng, origin.lat]
  const meters = distance(me, spot)
  if (meters > Math.min(8, Math.max(3, accuracy ?? 0))) {
    const deg = bearing(me, spot)
    return { step: 'walk', meters, bearing: deg, direction: compass(deg) }
  }
  if (origin.heading != null && heading !== null && heading >= 0) {
    const degrees = ((origin.heading - heading + 540) % 360) - 180
    if (Math.abs(degrees) > HEADING_TOLERANCE) return { step: 'turn', degrees }
  }
  return { step: 'ready' }
}

export type SpotPhotos = { photo: Photo; meters: number; count: number }

/**
 * Photos already taken around where one stands, one per series (its latest),
 * closest first: what can be taken again here.
 */
export function photosHere(photos: Photo[], me: Position, { radius = 25, limit = 6 } = {}): SpotPhotos[] {
  const latest = new Map<number, { photo: Photo; count: number }>()
  for (const photo of photos) {
    if (photo.kind === 'video') continue
    const first = photo.retakeOfId ?? photo.id
    const seen = latest.get(first)
    const count = (seen?.count ?? 0) + 1
    latest.set(first, { photo: !seen || when(photo) > when(seen.photo) ? photo : seen.photo, count })
  }
  const found: SpotPhotos[] = []
  for (const { photo, count } of latest.values()) {
    // A retake without a position stands where its series does.
    const placed = photo.lng !== null && photo.lat !== null ? photo : photos.find((p) => p.id === (photo.retakeOfId ?? photo.id))
    if (!placed || placed.lng === null || placed.lat === null) continue
    const meters = distance(me, [placed.lng, placed.lat])
    if (meters <= radius) found.push({ photo, meters, count })
  }
  return found.sort((a, b) => a.meters - b.meters).slice(0, limit)
}
