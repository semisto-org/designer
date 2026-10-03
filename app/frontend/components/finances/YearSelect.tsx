import { Select } from '@/components/ui/Field'
import { t } from '@/lib/i18n'

/** Plan year 1..horizon, shown with its calendar year; optional "until the end". */
export function YearSelect({ value, onValue, startYear, horizon = 20, allowEmpty, emptyLabel, ...rest }: {
  value: number | null
  onValue: (value: number | null) => void
  startYear: number
  horizon?: number
  allowEmpty?: boolean
  emptyLabel?: string
  disabled?: boolean
  id?: string
  'aria-label'?: string
}) {
  return (
    <Select {...rest} value={value ?? ''} onChange={(e) => onValue(e.target.value === '' ? null : Number(e.target.value))}>
      {allowEmpty && <option value="">{emptyLabel ?? t('finances.fields.end_year_hint')}</option>}
      {Array.from({ length: horizon }, (_, i) => i + 1).map((year) => (
        <option key={year} value={year}>{t('finances.kpis.year', { year, calendar: startYear + year - 1 })}</option>
      ))}
    </Select>
  )
}
