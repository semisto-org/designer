import { captureMessage } from '@sentry/react'
import { deepMerge } from '@/lib/localeSegments'

// Interface strings live in config/locales/*.yml (Rails I18n), shared by
// the server and this frontend. Keys are English, values French. Each
// feature area keeps its own file (config/locales/<area>.fr.yml).
//
// The browser does not download them all: the `rails-locales` plugin
// (vite.config.ts) cuts them into segments (lib/localeSegments) and adds to
// each module the segments its key strings name, so a page's strings come
// with its code. Each segment calls `register` as it loads.
type Dict = Record<string, unknown>

const locales: Record<string, Dict> = {}
const registered = new Set<string>()
let current = 'fr'

export function register(id: string, tree: Dict) {
  registered.add(id)
  for (const [locale, keys] of Object.entries(tree)) locales[locale] = deepMerge(locales[locale] ?? {}, keys as Dict)
}

export function setLocale(locale: string) {
  if (locales[locale]) current = locale
}

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Dict)[part]
    return undefined
  }, locales[current])
}

// A key the code builds from something no module spells out (a key sent by
// the server, say) can name a segment nobody loaded: everything is then
// fetched once, for the next renders, and the key reported so that the
// module that uses it can name it.
let everything: Promise<void> | null = null
const reported = new Set<string>()

function missing(key: string) {
  const [top, second] = key.split('.')
  if (second !== undefined && registered.has(`${top}.${second}`)) return
  everything ??= import('virtual:rails-locale/all').then(() => undefined, () => { everything = null })
  void everything.then(() => {
    if (lookup(key) === undefined || reported.has(key)) return
    reported.add(key)
    console.warn(`[i18n] ${key} was read before its strings were loaded: name it in the module that reads it.`)
    if (!import.meta.env.DEV) captureMessage('locale-segment-missing', { level: 'warning', fingerprint: ['locale-segment-missing'], extra: { key } })
  })
}

/**
 * t('maps.index.title') or t('maps.count', { count: 3 }).
 * Pluralization follows Rails keys: one / other (zero optional).
 */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  let value = lookup(key)
  if (value === undefined) missing(key)
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
  if (value === undefined && !key.includes('.')) missing(key)
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
