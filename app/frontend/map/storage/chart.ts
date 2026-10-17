import type { StorageReading } from '@/types/storage'

const DAY_MS = 86_400_000

/** Days since 1970 of an ISO date, read as a calendar day. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/**
 * The span a chart shows: from the first to the last reading, at least
 * 30 days, and values padded so that the good band is always in view.
 */
export function chartDomain(readings: StorageReading[], values: (r: StorageReading) => (number | null)[], band: [number, number]) {
  const days = readings.map((r) => dayNumber(r.measuredOn))
  const last = days.length ? Math.max(...days) : 0
  const first = days.length ? Math.min(...days, last - 30) : -30
  const all = readings.flatMap(values).filter((v): v is number => v != null)
  const low = Math.min(band[0], ...all)
  const high = Math.max(band[1], ...all)
  const pad = Math.max(1, (high - low) * 0.1)
  return { x: [first, last] as [number, number], y: [Math.floor(low - pad), Math.ceil(high + pad)] as [number, number] }
}

/** A linear scale from a domain to pixels. */
export function scale([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  return (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0))
}
