import { t } from '@/lib/i18n'

const decimal = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2 })
export const formatDecimal = (n: number) => decimal.format(n)

const dateFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return dateFormat.format(new Date(y, m - 1, d))
}

export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const

/** French label of a vocabulary key (« sun » → « Soleil »). */
export const vocab = (facet: string, key: string) => t(`plants.vocabulary.${facet}.${key}`)

export const strataLabel = (strata: string) => t(`plants.strata.${strata}`)

export const metres = (value: number | null | undefined) => (value == null ? '—' : t('plants.units.metres', { value: formatDecimal(value) }))

export function countryNames(codes: string[]): string {
  return codes.map((c) => { const label = t(`plants.countries.${c}`); return label.startsWith('⟨') ? c : label }).join(', ')
}
