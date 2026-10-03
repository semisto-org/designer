// Interface strings live in config/locales/fr.yml (Rails I18n), shared by
// the server and this frontend. Keys are English, values French.
import fr from '../../../config/locales/fr.yml'

type Dict = Record<string, unknown>
const locales: Record<string, Dict> = { fr: (fr as Dict).fr as Dict }
let current = 'fr'

export function setLocale(locale: string) {
  if (locales[locale]) current = locale
}

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Dict)[part]
    return undefined
  }, locales[current])
}

/**
 * t('maps.index.title') or t('maps.count', { count: 3 }).
 * Pluralization follows Rails keys: one / other (zero optional).
 */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  let value = lookup(key)
  if (value && typeof value === 'object' && 'count' in vars) {
    const count = Number(vars.count)
    const forms = value as Dict
    value = (count === 0 && forms.zero) || (count === 1 ? forms.one : forms.other) || forms.other
  }
  if (typeof value !== 'string') return import.meta.env.DEV ? `⟨${key}⟩` : key.split('.').pop() ?? key
  return value.replace(/%\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `%{${name}}`))
}

export function translations(key: string): Dict {
  const value = lookup(key)
  return value && typeof value === 'object' ? (value as Dict) : {}
}

const numberFormat = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 })
export const formatNumber = (n: number) => numberFormat.format(n)

/** Human area: m² under one hectare, then hectares. */
export function formatArea(m2: number | null | undefined): string {
  if (m2 == null) return '—'
  if (m2 < 10_000) return `${formatNumber(Math.round(m2))} m²`
  return `${new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2 }).format(m2 / 10_000)} ha`
}

export function formatLength(m: number | null | undefined): string {
  if (m == null) return '—'
  if (m < 1000) return `${formatNumber(Math.round(m * 10) / 10)} m`
  return `${new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2 }).format(m / 1000)} km`
}
