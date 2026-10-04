// Money and quantities for the financial dashboard (fr-BE, euros, no
// cents: these are estimates).
const NBSP = ' '
const money = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const integer = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('fr-BE', { notation: 'compact', maximumFractionDigits: 1 })

export function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—'
  const rounded = Math.round(value)
  return money.format(rounded === 0 ? 0 : rounded).replace('-', '−')
}

/** Axis ticks: "12 k€", "−5 k€". */
export function formatMoneyCompact(value: number): string {
  if (Math.abs(value) < 1000) return `${integer.format(value).replace('-', '−')}${NBSP}€`
  return `${compact.format(value).replace('-', '−')}${NBSP}€`
}

export function formatQuantity(value: number | null | undefined, unit: string): string {
  if (value == null) return '—'
  return `${integer.format(Math.round(value)).replace('-', '−')}${NBSP}${unit}`
}

/** Table cells: integers with a proper minus, empty for zero. */
export function formatCell(value: number): string {
  const rounded = Math.round(value)
  return rounded === 0 ? '–' : integer.format(rounded).replace('-', '−')
}
