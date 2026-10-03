const formatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600], ['month', 30 * 24 * 3600], ['day', 24 * 3600], ['hour', 3600], ['minute', 60],
]

/** « il y a 2 jours », « hier », « à l'instant ». */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(0, 'second')
}
