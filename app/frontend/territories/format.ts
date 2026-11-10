import { formatNumber } from '@/lib/i18n'

/** A commune's area: « 57,3 km² ». */
export function formatKm2(m2: number): string {
  return `${formatNumber(Math.round(m2 / 100_000) / 10)} km²`
}
