// Interface strings come from the Rails locale files (config/locales),
// copied into fr.json by scripts/locales.mjs. Same keys and %{var}
// interpolation as the web app (app/frontend/lib/i18n.ts).
import fr from '../i18n/fr.json'

type Dict = { [key: string]: unknown }

export type Vars = Record<string, string | number | null | undefined>

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Dict)[part] : undefined), fr)
}

export function t(key: string, vars: Vars = {}): string {
  let value = lookup(key)
  if (value && typeof value === 'object' && 'count' in vars) {
    const forms = value as Dict
    value = vars.count === 0 && forms.zero ? forms.zero : vars.count === 1 ? forms.one : (forms.other ?? forms.one)
  }
  if (typeof value !== 'string') return key
  return value.replace(/%\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
}

export function has(key: string): boolean {
  return typeof lookup(key) === 'string'
}

/** « 4 octobre 2026 » from an ISO date or date-time. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** « 12 m », « 1,2 km ». */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('fr-BE', { maximumFractionDigits: 1 })} km`
}

/** « 470 m² », « 1,2 ha » (from one hectare). */
export function formatArea(squareMeters: number): string {
  if (squareMeters < 10_000) return `${Math.round(squareMeters).toLocaleString('fr-BE')} m²`
  return `${(squareMeters / 10_000).toLocaleString('fr-BE', { maximumFractionDigits: 2 })} ha`
}

/** Today's date on the phone, as the server's ISO date (YYYY-MM-DD). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** « sam. 17 oct. », the day as written in a field notebook. */
export function formatDay(now = new Date()): string {
  return now.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** « 14 h 05 », the hour as French writes it (the website's site_visit_hour). */
export function formatTime(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getHours()} h ${String(date.getMinutes()).padStart(2, '0')}`
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

/** The season by the months gardeners count in (December to February is winter). */
export function seasonOf(now = new Date()): Season {
  const month = now.getMonth()
  if (month === 11 || month <= 1) return 'winter'
  if (month <= 4) return 'spring'
  if (month <= 7) return 'summer'
  return 'autumn'
}
