// Where and when a photo from the library was taken, from its EXIF block
// (iOS nests GPS under {GPS}, Android gives flat GPS* keys). Pure.
import type { Position } from './types'

export function exifPosition(exif: Record<string, unknown> | null | undefined): Position | null {
  if (!exif) return null
  const gps = (exif['{GPS}'] as Record<string, unknown> | undefined) ?? exif
  const lat = Number(gps.Latitude ?? gps.GPSLatitude)
  const lng = Number(gps.Longitude ?? gps.GPSLongitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null
  const south = String(gps.LatitudeRef ?? gps.GPSLatitudeRef ?? 'N') === 'S'
  const west = String(gps.LongitudeRef ?? gps.GPSLongitudeRef ?? 'E') === 'W'
  return [west ? -Math.abs(lng) : lng, south ? -Math.abs(lat) : lat]
}

export function exifDate(exif: Record<string, unknown> | null | undefined): string | null {
  const raw = (exif?.['{Exif}'] as Record<string, unknown> | undefined)?.DateTimeOriginal ?? exif?.DateTimeOriginal
  const match = typeof raw === 'string' && raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).toISOString()
}
