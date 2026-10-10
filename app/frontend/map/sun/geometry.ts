// Pure helpers for the "Soleil" panel (no React, no i18n: unit-tested).
import type { HorizonPoint, SunMonth, SunPathPoint } from './types.ts'

/** Horizon height at a compass azimuth, linear between samples, wrapping through north. */
export function horizonAt(profile: HorizonPoint[], azimuth: number): number {
  if (profile.length === 0) return 0
  const points = [...profile].sort((a, b) => a.azimuth - b.azimuth)
  const az = ((azimuth % 360) + 360) % 360
  const index = points.findIndex((p) => p.azimuth >= az)
  const after = index === -1 ? points[0] : points[index]
  const before = index === -1 ? points[points.length - 1] : points[(index - 1 + points.length) % points.length]
  if (after.azimuth === az) return after.height
  const span = (((after.azimuth - before.azimuth) % 360) + 360) % 360
  if (span === 0) return before.height
  const fraction = ((((az - before.azimuth) % 360) + 360) % 360) / span
  return before.height + (after.height - before.height) * fraction
}

export type PathRun = { visible: boolean; points: SunPathPoint[] }

/**
 * Splits a sun path into runs where the sun is above the terrain's horizon
 * (visible) or hidden behind it. Neighbouring runs share their boundary
 * point so the drawn line has no gap. Without a profile, everything above
 * the flat horizon is visible.
 */
export function splitPath(points: SunPathPoint[], profile: HorizonPoint[] | null): PathRun[] {
  const runs: PathRun[] = []
  for (const point of points) {
    const visible = point.elevation > Math.max(0, profile ? horizonAt(profile, point.azimuth) : 0)
    const last = runs[runs.length - 1]
    if (last && last.visible === visible) {
      last.points.push(point)
    } else {
      const previous = last?.points[last.points.length - 1]
      runs.push({ visible, points: previous ? [previous, point] : [point] })
    }
  }
  return runs
}

/** 590 → "9 h 50"; 720 → "12 h". */
export function clock(minutes: number): string {
  const rounded = Math.round(minutes)
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

/** 5.63 → "5 h 40" (to the nearest 5 minutes); 0.04 → "0 h". */
export function duration(hours: number): string {
  const minutes = Math.round((hours * 60) / 5) * 5
  return clock(minutes)
}

/** The month where the relief takes the most direct sun, or null when it takes under 15 minutes everywhere. */
export function biggestLoss(months: SunMonth[]): { month: SunMonth; lostHours: number } | null {
  let best: { month: SunMonth; lostHours: number } | null = null
  for (const month of months) {
    if (month.terrainHours == null) continue
    const lostHours = month.openHours - month.terrainHours
    if (!best || lostHours > best.lostHours) best = { month, lostHours }
  }
  return best && best.lostHours >= 0.25 ? best : null
}
