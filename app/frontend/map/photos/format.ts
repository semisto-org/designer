import { t } from '@/lib/i18n'
import type { MapPhotoData } from '@/types/soil_photos'

/** "2,6 Mo" / "31 Mo": same rule as the server, so the limits read alike. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  const text = mb >= 10 || mb === Math.round(mb) ? String(Math.round(mb)) : mb.toFixed(1).replace('.', ',')
  return `${text} Mo`
}

const dayFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * The server sends ISO 8601 strings with the app's own offset (Brussels). We show the wall clock the
 * photographer saw, whatever the browser's time zone, so only the first 19 characters are read.
 */
export function wallClockDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso)
  if (!match) return new Date(iso)
  const [, y, mo, d, h, mi, s] = match
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0))
}

export const photoDate = (photo: MapPhotoData): Date => wallClockDate(photo.takenAt ?? photo.createdAt)
export const formatDay = (date: Date) => dayFormat.format(date)
export const formatMonth = (date: Date) => monthFormat.format(date)
export const formatDateTime = (date: Date) => dateTimeFormat.format(date)

/** The label of a photo: its caption, else its date. */
export function photoLabel(photo: MapPhotoData): string {
  return photo.caption?.trim() || formatDay(photoDate(photo))
}

export function photoUrl(mapId: number, photoId: number, size: 'thumb' | 'large' | 'original' = 'large', download = false): string {
  return `/maps/${mapId}/photos/${photoId}/image?size=${size}${download ? '&download=1' : ''}`
}

/** « Nord-est (45°) » for a compass heading. */
export function headingLabel(heading: number): string {
  const points = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  const index = Math.round(((heading % 360) + 360) % 360 / 45) % 8
  return `${t(`soil_photos.compass_points.${points[index]}`)} (${Math.round(heading)}°)`
}
