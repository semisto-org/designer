import { formatDate, formatDecimal, MONTH_KEYS, strataLabel, todayIso, vocab } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { plantedAge, type PlantLine } from '@/palette/plants'
import { cellValue, statusOf, type PaletteRow } from '@/palette/table'

const euro = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' })
export const formatEuro = (n: number) => euro.format(n)

/** Columns drawn right-aligned, with tabular figures. */
export const NUMERIC = new Set([
  'existing', 'target', 'planned', 'planted', 'to_plant', 'patches', 'height', 'spread', 'unit_price', 'amount',
  'amount_to_plant', 'established', 'struggling', 'dead', 'survival_rate',
])

export const MONEY = new Set(['unit_price', 'amount', 'amount_to_plant'])

/** « il y a 3 mois », « 2 hivers déjà » after a planting date; empty when nobody knows it. */
export function plantedAgeLabel(plantedOn: string | null, precision: PlantLine['plantedPrecision']): string {
  const age = plantedAge(plantedOn, precision, todayIso())
  if (!age) return ''
  return age.unit === 'today' ? t('plant_palette.plants.age.today') : t(`plant_palette.plants.age.${age.unit}`, { count: age.count })
}

export const columnLabel = (column: string) => t(`plant_palette.columns.${column}`)

export function groupLabel(groupBy: string, key: string | null): string {
  if (key == null) return t(`plant_palette.group_empty.${groupBy}`)
  switch (groupBy) {
    case 'strata': return strataLabel(key)
    case 'status': return t(`plant_palette.statuses.${key}`)
    case 'role': return t(`palette.roles.${key}`)
    case 'plant_type': return vocab('plant_type', key)
    default: return key
  }
}

const months = (list: number[]) => list.map((m) => t(`plants.vocabulary.months_short.${MONTH_KEYS[m - 1]}`)).join(', ')

/** What a cell shows (and what the CSV holds): French words, units, commas. */
export function displayValue(row: PaletteRow, column: string): string {
  const value = cellValue(row, column)
  switch (column) {
    case 'name': return row.name
    case 'strata': return strataLabel(row.strata)
    case 'plant_type': return row.plantType ? vocab('plant_type', row.plantType) : ''
    case 'role': return row.role ? t(`palette.roles.${row.role}`) : ''
    case 'status': return t(`plant_palette.statuses.${statusOf(row)}`)
    case 'height':
    case 'spread': return value == null ? '' : t('plants.units.metres', { value: formatDecimal(Number(value)) })
    case 'hardiness': return value == null ? '' : t('plant_palette.cells.zone', { zone: Number(value) })
    case 'exposures': return row.exposures.map((e) => vocab('exposures', e)).join(', ')
    case 'edible': return value == null ? '' : t('plants.units.rating', { value: Number(value) })
    case 'flowering': return months(row.floweringMonths)
    case 'harvest': return months(row.harvestMonths)
    case 'fit': return row.fit && row.speciesId != null ? fitText(row) : ''
    case 'native': return value == null ? '' : t(value ? 'plant_palette.cells.yes_value' : 'plant_palette.cells.no_value')
    case 'unit_price':
    case 'amount':
    case 'amount_to_plant': return value == null ? '' : formatEuro(Number(value))
    case 'survival_rate': return value == null ? '' : `${value} %`
    case 'planted_dates':
      if (!row.plantedFrom) return ''
      return row.plantedTo && row.plantedTo !== row.plantedFrom ? `${formatDate(row.plantedFrom)} → ${formatDate(row.plantedTo)}` : formatDate(row.plantedFrom)
    default: return value == null ? '' : typeof value === 'number' ? formatDecimal(value) : String(value)
  }
}

/** The verdicts in words, for the CSV: « Rusticité ✓, Exposition ? ». */
const MARKS: Record<string, string> = { fits: '✓', partial: '~', misfit: '✗', unknown: '?' }
function fitText(row: PaletteRow): string {
  const flag = row.excludedBy === 'invasive' || row.excludedBy === 'toxic' ? [t(`palette.fit.excluded_by.${row.excludedBy}`)] : []
  return [...flag, ...row.fit!.criteria.map((c) => `${t(`palette.fit.criteria.${c.key}`)} ${MARKS[c.status]}`)].join(', ')
}

/** A total under a column: euros for money, plain numbers for the rest. */
export const displayTotal = (column: string, value: number) => (MONEY.has(column) ? formatEuro(value) : formatDecimal(value))
