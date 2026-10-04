// French formatting for climate values: proper minus sign, non-breaking
// space before units, signed deltas.
const one = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 })
const NBSP = ' '

function number(value: number): string {
  return one.format(value).replace('-', '−')
}

export function formatTemp(value: number | null | undefined): string {
  return value == null ? '—' : `${number(value)}${NBSP}°C`
}

export function formatDelta(value: number | null | undefined, unit = '°C'): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${number(value)}${NBSP}${unit}`
}

export function formatPct(value: number | null | undefined): string {
  return formatDelta(value, '%')
}

export function formatMm(value: number | null | undefined): string {
  return value == null ? '—' : `${number(value)}${NBSP}mm`
}

/** "04-25" -> "25 avril" */
export function formatMonthDay(value: string | null | undefined): string {
  if (!value) return '—'
  const [month, day] = value.split('-').map(Number)
  if (!month || !day) return '—'
  return new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.UTC(2001, month - 1, day))
}

/** "2026-10-08" -> "jeu. 8" */
export function formatWeekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-BE', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d))
}

/** Several dates: "jeu. 8 et ven. 9" */
export function formatDates(dates: string[]): string {
  const days = dates.map(formatWeekday)
  if (days.length <= 1) return days[0] ?? ''
  return `${days.slice(0, -1).join(', ')} et ${days[days.length - 1]}`
}

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'showers' | 'storm'

/** WMO weather interpretation codes, as returned by Open-Meteo. */
export function weatherKind(code: number | null): WeatherKind {
  if (code == null) return 'cloudy'
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 95) return 'storm'
  return 'cloudy'
}
