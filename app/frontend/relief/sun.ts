// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The sun on the relief: where the shade falls at a given time, and how many
// hours of direct sun each square metre gets in a day. Shadows are computed
// on the SURFACE model (trees, hedges and roofs included), not the bare
// terrain: it is the canopy that shades a forest garden. No import (neither
// three.js nor the DOM) so it can be exercised alone.

const RAD = Math.PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545
const OBLIQUITY = RAD * 23.4397

export type SunPosition = {
  /** Radians from NORTH, clockwise (π/2 = east). */
  azimuth: number
  /** Radians above the horizon. */
  altitude: number
}

/**
 * Sun position from SunCalc's formulas (V. Agafonkin, after the Leiden
 * Observatory's "Astronomy Answers"): within a few tenths of a degree, enough
 * for a shadow to the metre.
 */
export function sunPosition(date: Date, lat: number, lng: number): SunPosition {
  const days = date.valueOf() / DAY_MS - 0.5 + J1970 - J2000
  const anomaly = RAD * (357.5291 + 0.98560028 * days)
  const center = RAD * (1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly))
  const longitude = anomaly + center + RAD * 102.9372 + Math.PI
  const declination = Math.asin(Math.sin(longitude) * Math.sin(OBLIQUITY))
  const ascension = Math.atan2(Math.sin(longitude) * Math.cos(OBLIQUITY), Math.cos(longitude))
  const hourAngle = RAD * (280.16 + 360.9856235 * days) + RAD * lng - ascension
  const phi = RAD * lat
  const altitude = Math.asin(Math.sin(phi) * Math.sin(declination) +
                             Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle))
  // SunCalc counts the azimuth from the SOUTH towards the west; + π brings it north.
  const fromSouth = Math.atan2(Math.sin(hourAngle),
                               Math.cos(hourAngle) * Math.sin(phi) - Math.tan(declination) * Math.cos(phi))
  return { azimuth: (fromSouth + Math.PI) % (2 * Math.PI), altitude }
}

/**
 * The shade at an instant: 1 = in the sun, 0 = in the shade (of the relief, a
 * tree, a roof, or the slope itself turning its back to the sun).
 *
 * A single sweep starting from the sun's side: each cell inherits the "shade
 * height" of its sun-side neighbour, lowered by the ray's slope (distance ×
 * tan(sun altitude)). If that height is above the surface the cell is in the
 * shade; otherwise the surface becomes the new shade height. The neighbour
 * rarely falls on a cell: interpolate between the two nearest.
 *
 * `surface`: heights (m), rows from north to south. `out`/`level` are reused.
 */
export function shadowMask(
  surface: ArrayLike<number>, cols: number, rows: number, cellSize: number, sun: SunPosition,
  out: Uint8Array = new Uint8Array(cols * rows), level: Float32Array = new Float32Array(cols * rows),
): Uint8Array {
  if (sun.altitude <= 0) {
    out.fill(0)
    return out
  }
  // Towards the sun, in cells: +x east, +y south (rows go down).
  const ux = Math.sin(sun.azimuth)
  const uy = -Math.cos(sun.azimuth)
  const slope = Math.tan(sun.altitude)
  const epsilon = 0.05

  if (Math.abs(ux) >= Math.abs(uy)) {
    const dc = ux > 0 ? 1 : -1
    const dr = uy / Math.abs(ux)
    const drop = cellSize * Math.hypot(1, dr) * slope
    const start = dc > 0 ? cols - 1 : 0
    for (let c = start; c >= 0 && c < cols; c -= dc) {
      const up = c + dc
      for (let r = 0; r < rows; r++) {
        const i = r * cols + c
        const height = surface[i]
        let shade = -Infinity
        if (up >= 0 && up < cols) {
          const rr = r + dr
          const r0 = Math.floor(rr)
          if (r0 >= 0 && r0 + 1 < rows) {
            const f = rr - r0
            shade = level[r0 * cols + up] * (1 - f) + level[(r0 + 1) * cols + up] * f - drop
          } else if (r0 >= 0 && r0 < rows) {
            shade = level[r0 * cols + up] - drop
          }
        }
        out[i] = shade > height + epsilon ? 0 : 1
        level[i] = shade > height ? shade : height
      }
    }
  } else {
    const dr = uy > 0 ? 1 : -1
    const dc = ux / Math.abs(uy)
    const drop = cellSize * Math.hypot(1, dc) * slope
    const start = dr > 0 ? rows - 1 : 0
    for (let r = start; r >= 0 && r < rows; r -= dr) {
      const up = r + dr
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const height = surface[i]
        let shade = -Infinity
        if (up >= 0 && up < rows) {
          const cc = c + dc
          const c0 = Math.floor(cc)
          if (c0 >= 0 && c0 + 1 < cols) {
            const f = cc - c0
            shade = level[up * cols + c0] * (1 - f) + level[up * cols + c0 + 1] * f - drop
          } else if (c0 >= 0 && c0 < cols) {
            shade = level[up * cols + c0] - drop
          }
        }
        out[i] = shade > height + epsilon ? 0 : 1
        level[i] = shade > height ? shade : height
      }
    }
  }
  return out
}

/**
 * Hours of direct sun of each cell over a day starting at `dayStart` (local
 * midnight of the MAP's time zone, see `zonedTime`), sampled every
 * `stepMinutes`. Also returns the day length (sun above the horizon). Yields
 * every few passes so the page stays responsive.
 */
export async function sunHours(
  surface: ArrayLike<number>, cols: number, rows: number, cellSize: number, lat: number, lng: number, dayStart: Date,
  { stepMinutes = 15, onProgress, signal }: { stepMinutes?: number; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<{ hours: Float32Array; daylight: number }> {
  const hours = new Float32Array(cols * rows)
  const mask = new Uint8Array(cols * rows)
  const level = new Float32Array(cols * rows)
  const step = stepMinutes / 60
  const samples = Math.round(24 / step)
  let daylight = 0
  for (let k = 0; k < samples; k++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    // The middle of each interval stands for the interval.
    const at = new Date(dayStart.valueOf() + (k + 0.5) * step * 3600000)
    const sun = sunPosition(at, lat, lng)
    if (sun.altitude > 0) {
      daylight += step
      shadowMask(surface, cols, rows, cellSize, sun, mask, level)
      for (let i = 0; i < mask.length; i++) if (mask[i]) hours[i] += step
    }
    if (k % 6 === 5) {
      onProgress?.(k / samples)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  return { hours, daylight }
}

/**
 * The instant of a wall-clock time in a time zone (e.g. 14:00 on 21 June in
 * Europe/Brussels), whatever the browser's own zone. Claudy built dates in
 * the browser's zone; a map has its own.
 */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const offset = zoneOffsetMs(new Date(guess), timeZone)
  const first = guess - offset
  // Around a DST switch the offset of the result may differ from the guess's.
  const second = guess - zoneOffsetMs(new Date(first), timeZone)
  return new Date(second)
}

/** Offset of a time zone from UTC at an instant, in ms (Brussels summer: +2 h). */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date)
  } catch {
    return -date.getTimezoneOffset() * 60000
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(date.valueOf() / 1000) * 1000
}

/** Sunrise and sunset (minutes after local midnight) by sampling, or null in polar day/night. */
export function daylightWindow(lat: number, lng: number, dayStart: Date): { rise: number; set: number } | null {
  let rise: number | null = null
  let set: number | null = null
  for (let minute = 0; minute <= 24 * 60; minute += 5) {
    const up = sunPosition(new Date(dayStart.valueOf() + minute * 60000), lat, lng).altitude > 0
    if (up && rise == null) rise = minute
    if (up) set = minute
  }
  return rise == null || set == null ? null : { rise, set }
}
