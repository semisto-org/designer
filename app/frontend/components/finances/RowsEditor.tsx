import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { NumberInput } from '@/components/finances/NumberInput'
import { YearSelect } from '@/components/finances/YearSelect'
import { t } from '@/lib/i18n'

type Row = { id: string } & Record<string, unknown>

export type Column<R extends Row> = {
  key: keyof R & string
  label: string
  type: 'text' | 'number' | 'integer' | 'select' | 'year' | 'end_year'
  options?: { value: string; label: string }[]
  unit?: string
  /** Relative width in the desktop grid. */
  span?: number
  placeholder?: string
}

type Props<R extends Row> = {
  title: string
  intro?: string
  rows: R[]
  columns: Column<R>[]
  onChange: (rows: R[]) => void
  newRow: () => R
  readOnly: boolean
  startYear: number
  /** Optional line under each row (e.g. a computed hint). */
  footer?: (row: R) => React.ReactNode
}

/**
 * A list of assumption rows (costs, revenues, subsidies, loans…): a compact
 * grid with a header on large screens, labelled cards on phones.
 */
export function RowsEditor<R extends Row>({ title, intro, rows, columns, onChange, newRow, readOnly, startYear, footer }: Props<R>) {
  const template = columns.map((c) => `minmax(0,${c.span ?? 1}fr)`).join(' ') + (readOnly ? '' : ' 2.25rem')
  const update = (index: number, key: string, value: unknown) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-base">{title}</h3>
        {intro && <p className="mt-0.5 text-sm text-loam-500">{intro}</p>}
      </header>
      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-xs font-medium text-loam-500 md:grid" style={{ gridTemplateColumns: template }} aria-hidden>
            {columns.map((c) => <span key={c.key}>{c.label}</span>)}
          </div>
          {rows.map((row, index) => (
            <div key={row.id} className="rounded-lg bg-loam-50 p-2.5 md:bg-transparent md:p-0">
              <div className="grid grid-cols-2 gap-2 md:items-center [&>*]:min-w-0 md:[grid-template-columns:var(--cols)]" style={{ '--cols': template } as React.CSSProperties}>
                {columns.map((column) => (
                  <label key={column.key} className={clsx('block space-y-1 md:space-y-0', column.type === 'text' && 'col-span-2 md:col-span-1')}>
                    <span className="block text-xs font-medium text-loam-600 md:sr-only">{column.label}</span>
                    <Cell column={column} row={row} readOnly={readOnly} startYear={startYear} onValue={(value) => update(index, column.key, value)} />
                  </label>
                ))}
                {!readOnly && (
                  <div className="col-span-2 flex justify-end md:col-span-1">
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      className="grid h-9 w-9 place-items-center rounded-lg text-loam-400 hover:bg-clay-50 hover:text-clay-700"
                      aria-label={t('finances.actions.remove_named', { name: String(row.label ?? '') })}
                      title={t('finances.actions.remove')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {footer && <div className="mt-1 px-1 text-xs text-loam-500">{footer(row)}</div>}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <Button variant="secondary" size="sm" onClick={() => onChange([...rows, newRow()])} className="print:hidden">
          <Plus className="h-4 w-4" />
          {t('finances.actions.add_row')}
        </Button>
      )}
    </section>
  )
}

function Cell<R extends Row>({ column, row, readOnly, startYear, onValue }: {
  column: Column<R>; row: R; readOnly: boolean; startYear: number; onValue: (value: unknown) => void
}) {
  const value = row[column.key]
  switch (column.type) {
    case 'text':
      return <Input value={(value as string | null) ?? ''} placeholder={column.placeholder} disabled={readOnly} maxLength={200} onChange={(e) => onValue(e.target.value || null)} />
    case 'number':
    case 'integer':
      return <NumberInput value={value as number | null} integer={column.type === 'integer'} unit={column.unit} disabled={readOnly} onValue={onValue} />
    case 'select':
      return (
        <Select value={(value as string) ?? ''} disabled={readOnly} onChange={(e) => onValue(e.target.value)}>
          {column.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      )
    case 'year':
      return <YearSelect value={(value as number | null) ?? 1} startYear={startYear} disabled={readOnly} onValue={(v) => onValue(v ?? 1)} />
    case 'end_year':
      return <YearSelect value={value as number | null} startYear={startYear} disabled={readOnly} allowEmpty onValue={onValue} />
  }
}

/** A short random id for new rows (the server keeps it). */
export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
