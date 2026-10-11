import clsx from 'clsx'
import type { ReactNode } from 'react'
import { formatNumber, t } from '@/lib/i18n'
import type { BudgetLine, OfferInputs, Phase } from '@/types/offers'
import type { SaveStatus } from './useOfferAutosave'

const money = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const moneyCents = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Whole euros, the way an offer shows them. */
export const euros = (value: number | null | undefined) => (value == null ? '—' : money.format(Math.round(value)).replace('-', '−'))
/** Euros and cents, for unit prices and rates. */
export const eurosCents = (value: number | null | undefined) => (value == null ? '—' : moneyCents.format(value).replace('-', '−'))

export const hoursText = (value: number) => `${formatNumber(value)} h`

/** The label of a budget line: the catalogue's, or the team's own. */
export function lineLabel(line: BudgetLine): string {
  if (line.kind === 'trip') return line.label || t('offers.trips.label')
  if (line.kind === 'custom') return line.label || t('offers.budget.custom_label')
  if (line.label) return line.label
  return t(`offers.tasks.${line.task}`)
}

/** A pricing's own label, else Semisto's for that key. */
export const typeLabel = (type: { key: string; label?: string | null }) => type.label || t(`offers.planting_types.${type.key}`)
export const categoryLabel = (category: { key: string; label?: string | null }) => category.label || t(`offers.categories.${category.key}`)

/** « 2 h + 0,02 h × 510 plants », or « forfait ». */
export function formulaText(line: BudgetLine): string | null {
  const formula = line.formula
  if (!formula) return null
  if (!formula.driver || !formula.per) return t('offers.budget.formula_fixed')
  const driver = t(`offers.drivers.${formula.driver}`, { value: formatNumber(formula.value ?? 0) })
  return t('offers.budget.formula', { base: formatNumber(formula.base), per: formatNumber(formula.per), driver })
}

export const phaseLabel = (phase: Phase) => t(`offers.phases.${phase}`)

/** Sets (or clears) the team's correction of one computed line. */
export function withLineOverride(inputs: OfferInputs, key: string, patch: Partial<{ persons: number | null; hours: number | null; amount: number | null; disabled: boolean }>): OfferInputs {
  const current = inputs.lines.find((line) => line.key === key) ?? { key, persons: null, hours: null, amount: null, disabled: false }
  const next = { ...current, ...patch }
  const others = inputs.lines.filter((line) => line.key !== key)
  const empty = next.persons == null && next.hours == null && next.amount == null && !next.disabled
  return { ...inputs, lines: empty ? others : [...others, next] }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const label = {
    new: t('offers.page.not_saved'), pending: t('offers.page.pending'), saving: t('offers.page.saving'),
    saved: t('offers.page.saved'), error: t('offers.page.save_error'),
  }[status]
  return (
    <span role="status" className={clsx('text-xs', status === 'error' ? 'text-clay-600' : 'text-loam-500')}>
      {status === 'error' ? t('offers.page.save_error') : label}
    </span>
  )
}

/** A section heading in the field-notebook voice: serif title, small help. */
export function SectionTitle({ title, help, aside }: { title: ReactNode; help?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="font-serif text-xl font-semibold text-prune-800">{title}</h2>
        {help && <p className="mt-0.5 text-sm text-loam-500">{help}</p>}
      </div>
      {aside}
    </div>
  )
}

/** The dots of the offer's phases: « 1 · », « 2 ·· », « 3 ··· ». */
export function PhaseMark({ phase }: { phase: Phase }) {
  return <span className="font-serif text-leaf-700">{t(`offers.phase_numbers.${phase}`)}</span>
}
