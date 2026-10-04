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
    value = vars.count === 1 ? forms.one : (forms.other ?? forms.one)
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

/** Today's date on the phone, as the server's ISO date (YYYY-MM-DD). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
