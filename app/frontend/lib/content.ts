import { t, translations } from '@/lib/i18n'

type Vars = Record<string, string | number>

const NBSP = ' '

/**
 * French typography: a no-break space before ":", ";", "?", "!", "»" and "%",
 * after "«", and between a number and its unit, so a line never starts with a
 * lone punctuation mark or a dangling "€".
 */
export function typo(text: string): string {
  return text
    .replace(/ (?=[:;?!»%])/g, NBSP)
    .replace(/« /g, `«${NBSP}`)
    .replace(/(\d) (?=(?:€|m²|ha\b|km\b|ares?\b|ans?\b|jours?\b|cartes?\b|mois\b))/g, `$1${NBSP}`)
}

function fill(text: string, vars: Vars): string {
  return text.replace(/%\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `%{${name}}`))
}

function walk(node: unknown, vars: Vars): unknown {
  if (typeof node === 'string') return typo(fill(node, vars))
  if (Array.isArray(node)) return node.map((item) => walk(item, vars))
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walk(value, vars)]))
  }
  return node
}

/** `t()` with French typography (no-break spaces) for page copy. */
export function tf(key: string, vars: Vars = {}): string {
  return typo(t(key, vars))
}

/**
 * A YAML list or map of the locale files as typed data (page copy: sections,
 * FAQ, features), with %{vars} filled and French typography applied.
 */
export function content<T>(key: string, vars: Vars = {}): T {
  return walk(translations(key), vars) as T
}

/** The string values of a YAML map, in file order (e.g. a plan's `features`). */
export function values(key: string, vars: Vars = {}): string[] {
  return Object.values(content<Record<string, unknown>>(key, vars)).filter((v): v is string => typeof v === 'string')
}
