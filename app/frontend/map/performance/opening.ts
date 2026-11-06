// How long a map took to open in this browser, and on what kind of machine:
// lets Semisto see that the editor is slow for someone before they say so.
// Pure functions here (tested); MapOpeningProbe measures and sends.

/** What the probe measured for one opening of the editor. */
export type OpeningMeasure = {
  /** From the editor being ready on the map to its first `idle` (everything drawn). */
  toIdleMs: number
  /** Main-thread tasks over 50 ms in that window (Chromium only, else null). */
  longTasksMs: number | null
  /** Redraws in the 10 s after `idle` without anyone touching the map: should be 0. */
  idleRedraws: number | null
  /** How long the page had been open when the map was created: small on a full load. */
  pageAgeMs: number
  features: number
  plants: number
}

/** The machine, coarse enough to say nothing about the person. */
export type Device = {
  cores: number | null
  memoryGb: number | null
  pixelRatio: number
  gpu: string | null
}

/** Over either, the opening counts as slow and is reported to Sentry. */
export const SLOW_TO_IDLE_MS = 8000
export const SLOW_LONG_TASKS_MS = 3000
/** A map left alone should stop drawing; a few redraws are fades and late tiles. */
export const BUSY_IDLE_REDRAWS = 10

export type Speed = 'fast' | 'ok' | 'slow'

export function openingSpeed(m: OpeningMeasure): Speed {
  if (m.toIdleMs >= SLOW_TO_IDLE_MS || (m.longTasksMs ?? 0) >= SLOW_LONG_TASKS_MS) return 'slow'
  if (m.toIdleMs >= SLOW_TO_IDLE_MS / 2 || (m.longTasksMs ?? 0) >= SLOW_LONG_TASKS_MS / 2) return 'ok'
  return 'fast'
}

/** True when the map kept drawing while nobody touched it (a loop like PR #369's). */
export function staysBusy(m: OpeningMeasure): boolean {
  return (m.idleRedraws ?? 0) >= BUSY_IDLE_REDRAWS
}

/** The kind of graphics chip, from WebGL's renderer string. */
export function gpuClass(renderer: string | null): 'software' | 'integrated' | 'discrete' | 'apple' | 'unknown' {
  if (!renderer) return 'unknown'
  const r = renderer.toLowerCase()
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/.test(r)) return 'software'
  if (/apple m\d|apple gpu/.test(r)) return 'apple'
  if (/nvidia|geforce|quadro|radeon(?! ?(r\d|vega \d|graphics))|amd radeon pro|rtx|gtx/.test(r)) return 'discrete'
  if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|radeon graphics|vega \d/.test(r)) return 'integrated'
  return 'unknown'
}

/** Rounds a count into a few buckets, so Plausible's breakdowns stay readable. */
export function sizeBucket(n: number): string {
  if (n < 50) return '<50'
  if (n < 200) return '50-199'
  if (n < 500) return '200-499'
  if (n < 1000) return '500-999'
  return '1000+'
}

/** The Plausible event's properties: buckets only, never the map or the person. */
export function plausibleProps(m: OpeningMeasure, d: Device): Record<string, string> {
  return {
    speed: openingSpeed(m),
    busy: staysBusy(m) ? 'yes' : 'no',
    plants: sizeBucket(m.plants),
    cores: d.cores == null ? 'unknown' : d.cores <= 2 ? '1-2' : d.cores <= 4 ? '3-4' : d.cores <= 8 ? '5-8' : '9+',
    gpu: gpuClass(d.gpu),
  }
}
