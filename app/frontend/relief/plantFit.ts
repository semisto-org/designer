// Whether a spot suits a plant, read from the relief while it is placed in
// 3D: its sun at noon in June (the relief, the buildings and the plants of
// the year shown), its wetness and its frost pocket (station.ts), against
// the exposures, soil moisture and flowering months of its catalogue sheet.
// Everything here is a model: a spot that does not plainly suit the plant
// asks the person to go and look (`checks`), on the day that tells.
// Pure functions, no three.js: tested in test/frontend/relief.

import type { FrostClass, WetnessClass } from './station.ts'

/** What the catalogue says the plant needs (PlantSpecies exposures, soil_moisture, flowering months). */
export type PlantNeeds = {
  exposures: string[]
  soilMoisture: string[]
  flowering?: number[]
}

/** What the relief says of a spot. `sunJune`: in the sun at solar noon on 21 June, null when unknown. */
export type SpotReading = {
  sunJune: boolean | null
  wetness: WetnessClass | null
  frost: FrostClass | null
}

export type FitTone = 'good' | 'warn' | 'bad'
/** One thing said about the spot; `key` under relief.page.plant_tool.fit.*. */
export type FitNote = { key: string; tone: FitTone }
/** When to go and see: a June noon, after a heavy rain, a spring frost morning. */
export type FitCheck = 'june_noon' | 'after_rain' | 'spring_frost'
export type FitLevel = 'good' | 'fair' | 'poor' | 'unknown'
export type PlantFit = { level: FitLevel; notes: FitNote[]; checks: FitCheck[] }

/** The plant's moisture classes, driest first. */
const PLANT_WET: Record<string, number> = { dry: 0, moist: 1, wet: 2, waterlogged: 3 }
/** The relief's wetness classes on the same scale (fresh ground suits a « frais » plant). */
const SITE_WET: Record<WetnessClass, number> = { dry: 0, fresh: 1, moist: 2, wet: 3 }
/** Flowers this early meet the late frosts of a cold pocket. */
const EARLY_FLOWERS = [2, 3, 4, 5]

export function plantFit(needs: PlantNeeds, spot: SpotReading): PlantFit {
  const notes: FitNote[] = []
  const checks = new Set<FitCheck>()

  // Sun: a sun lover in the shade at midsummer noon will not fruit there.
  const exposures = new Set(needs.exposures)
  if (spot.sunJune != null && exposures.size) {
    const sunOnly = exposures.has('sun') && !exposures.has('partial-shade') && !exposures.has('shade')
    const shadeOnly = exposures.has('shade') && !exposures.has('sun') && !exposures.has('partial-shade')
    if (spot.sunJune) {
      if (shadeOnly) { notes.push({ key: 'sun_for_shade', tone: 'warn' }); checks.add('june_noon') }
      else notes.push({ key: 'sun', tone: 'good' })
    } else if (sunOnly) {
      notes.push({ key: 'shade_for_sun', tone: 'bad' })
      checks.add('june_noon')
    } else {
      notes.push({ key: 'shade_ok', tone: 'good' })
    }
  }

  // Water: how far the spot's wetness lies from what the plant likes.
  const likes = needs.soilMoisture.map((m) => PLANT_WET[m]).filter((v): v is number => v != null)
  if (spot.wetness && likes.length) {
    const site = SITE_WET[spot.wetness]
    const distance = Math.min(...likes.map((v) => Math.abs(v - site)))
    const wetter = likes.every((v) => v < site)
    if (distance === 0) notes.push({ key: 'soil_match', tone: 'good' })
    else {
      notes.push({ key: wetter ? 'soil_wetter' : 'soil_drier', tone: distance === 1 ? 'warn' : 'bad' })
      checks.add('after_rain')
    }
  }

  // Frost: a cold pocket where cold air settles on spring nights.
  if (spot.frost === 'high') {
    const early = (needs.flowering ?? []).some((m) => EARLY_FLOWERS.includes(m))
    notes.push({ key: early ? 'frost_flowers' : 'frost_pocket', tone: 'warn' })
    checks.add('spring_frost')
  }

  const level: FitLevel = notes.some((n) => n.tone === 'bad') ? 'poor'
    : notes.some((n) => n.tone === 'warn') ? 'fair'
      : notes.length ? 'good' : 'unknown'
  return { level, notes, checks: [...checks] }
}

/**
 * The shadow of a crown on flat ground, as a polygon (grid metres, x east,
 * y SOUTH): the crown's disc, and its copy thrown away from the sun, joined
 * by their outer tangents. `crownBottom`/`crownTop` in metres above the ground.
 */
export function crownShadow(
  x: number, y: number, radius: number, crownBottom: number, crownTop: number,
  sun: { azimuth: number; altitude: number }, segments = 16,
): Array<{ x: number; y: number }> {
  if (sun.altitude <= 0.02 || radius <= 0) return []
  // Away from the sun: azimuth from north clockwise, y grows southward.
  const dx = -Math.sin(sun.azimuth)
  const dy = Math.cos(sun.azimuth)
  const reach = (h: number) => Math.min(200, h / Math.tan(sun.altitude))
  const near = reach(crownBottom)
  const far = reach(crownTop)
  const a = { x: x + dx * near, y: y + dy * near }
  const b = { x: x + dx * Math.max(near, far - radius), y: y + dy * Math.max(near, far - radius) }
  // Half circle around `a` on the sun's side, half circle around `b` beyond.
  const base = Math.atan2(dy, dx)
  const ring: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= segments; i++) {
    const t = base + Math.PI / 2 + (i / segments) * Math.PI
    ring.push({ x: a.x + Math.cos(t) * radius, y: a.y + Math.sin(t) * radius })
  }
  for (let i = 0; i <= segments; i++) {
    const t = base - Math.PI / 2 + (i / segments) * Math.PI
    ring.push({ x: b.x + Math.cos(t) * radius, y: b.y + Math.sin(t) * radius })
  }
  return ring
}

/** The sun at its highest on a day (solar noon), sampled every 5 minutes around midday UTC. */
export function noonSun(
  date: { year: number; month: number; day: number }, lat: number, lng: number,
  position: (date: Date, lat: number, lng: number) => { azimuth: number; altitude: number },
): { azimuth: number; altitude: number } {
  // Solar noon falls near 12:00 minus the longitude's hours.
  const guess = Date.UTC(date.year, date.month - 1, date.day, 12) - (lng / 15) * 3_600_000
  let best = position(new Date(guess), lat, lng)
  for (let k = -24; k <= 24; k++) {
    const p = position(new Date(guess + k * 300_000), lat, lng)
    if (p.altitude > best.altitude) best = p
  }
  return best
}
