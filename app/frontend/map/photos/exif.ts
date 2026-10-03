import type { PhotoMeta } from '@/types/soil_photos'

const EMPTY: PhotoMeta = { lng: null, lat: null, heading: null, takenAt: null }

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-05-17T14:32:10" from the UTC fields of a Date (exifr returns the camera's wall clock as UTC). */
function wallClock(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

/** The same, from the browser's local clock (for file.lastModified). */
function localClock(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function validPosition(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false
  // Phones write 0, 0 when they had no fix.
  return !(lat === 0 && lng === 0)
}

/**
 * Reads position, direction and date from the EXIF block of a photo, in the
 * browser: the server never parses the file. Photos without EXIF (screenshots,
 * messaging apps strip it) give nulls, and the date falls back on the file's
 * modification time. Never throws.
 */
export async function readPhotoMeta(file: File): Promise<PhotoMeta> {
  const fallbackDate = file.lastModified ? localClock(new Date(file.lastModified)) : null
  try {
    const { parse, gps } = await import('exifr/dist/lite.esm.mjs')
    const [position, tags] = await Promise.all([
      gps(file).catch(() => undefined),
      parse(file, { gps: true, exif: true, pick: ['DateTimeOriginal', 'CreateDate', 'GPSImgDirection'] }).catch(() => undefined),
    ])
    const lat = position?.latitude
    const lng = position?.longitude
    const located = validPosition(lat, lng)
    const taken = [tags?.DateTimeOriginal, tags?.CreateDate].find(validDate)
    const heading = typeof tags?.GPSImgDirection === 'number' ? ((tags.GPSImgDirection % 360) + 360) % 360 : null
    return {
      lng: located ? (lng as number) : null,
      lat: located ? (lat as number) : null,
      heading,
      takenAt: taken ? wallClock(taken) : fallbackDate,
    }
  } catch {
    return { ...EMPTY, takenAt: fallbackDate }
  }
}
