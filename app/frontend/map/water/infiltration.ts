// How fast the soil drinks, from the readings of an infiltration test: the
// same computation as the server (app/services/infiltration/measurement.rb),
// so the inspector shows the rate as soon as a reading is noted. The server's
// figure is the one stored and shared. No import.

export type InfiltrationMethod = 'hole' | 'ring'
/** One reading: seconds since the start, height of water in cm. */
export type Reading = { t_s: number; depth_cm: number }
export type Interval = { fromS: number; toS: number; rateMmH: number }
export type Measurement = { intervals: Interval[]; rateMmH: number | null; stable: boolean }
export type RateClass = 'very_slow' | 'slow' | 'moderate' | 'rapid' | 'very_rapid'

export const STABLE_SPREAD = 0.25
/** Upper bounds (mm/h) of the classes, slowest first. */
export const CLASSES: Array<[RateClass, number]> = [['very_slow', 5], ['slow', 15], ['moderate', 50], ['rapid', 150], ['very_rapid', Infinity]]

export function classOf(rate: number | null | undefined): RateClass | null {
  if (rate == null || !Number.isFinite(rate)) return null
  return CLASSES.find(([, max]) => rate < max)![0]
}

function rate(method: InfiltrationMethod, radiusMm: number, h1: number, h2: number, hours: number): number {
  if (method === 'ring') return (h1 - h2) / hours
  // Porchet: the walls of the hole drink too.
  const half = radiusMm / 2
  return (half * Math.log((h1 + half) / (h2 + half))) / hours
}

/**
 * Rate per interval and the test's rate: the mean of the last three
 * intervals once they agree within 25 %, else the last one (not stable).
 * A height that goes up means the hole was filled again.
 */
export function measure(method: InfiltrationMethod, diameterCm: number | null | undefined, readings: Reading[]): Measurement {
  const radiusMm = diameterCm && diameterCm > 0 ? diameterCm * 5 : 150
  const intervals: Interval[] = []
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1]
    const b = readings[i]
    const h1 = a.depth_cm * 10
    const h2 = b.depth_cm * 10
    const hours = (b.t_s - a.t_s) / 3600
    if (h2 > h1 || hours <= 0) continue
    intervals.push({ fromS: a.t_s, toS: b.t_s, rateMmH: rate(method === 'ring' ? 'ring' : 'hole', radiusMm, h1, h2, hours) })
  }
  if (intervals.length < 2) return { intervals, rateMmH: null, stable: false }
  const last = intervals.slice(-3).map((i) => i.rateMmH)
  const mean = last.reduce((sum, v) => sum + v, 0) / last.length
  const stable = last.length === 3 && (mean === 0 || (Math.max(...last) - Math.min(...last)) / mean <= STABLE_SPREAD)
  const value = stable ? mean : last[last.length - 1]
  return { intervals, rateMmH: Math.round(value * 10) / 10, stable }
}

/**
 * Minutes until the next reading: about a centimetre of drop, between 5
 * and 30 minutes (a fast soil is read often, a clay one rarely).
 */
export function nextReadingMinutes(lastRateMmH: number | null): number {
  if (lastRateMmH == null || lastRateMmH <= 0) return 15
  const minutes = (10 / lastRateMmH) * 60
  return Math.min(30, Math.max(5, Math.round(minutes / 5) * 5))
}

/** Hours for a swale or rain garden of this depth to empty into the soil. */
export function emptyingHours(depthM: number, rateMmH: number): number | null {
  if (!(depthM > 0) || !(rateMmH > 0)) return null
  return (depthM * 1000) / rateMmH
}
