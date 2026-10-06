import clsx from 'clsx'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { translations } from '@/lib/i18n'
import type { SchemaField } from '@/types/journey'

export type Texts = {
  label?: string
  hint?: string
  placeholder?: string
  unit?: string
  add?: string
  remove?: string
  options?: Record<string, string>
  item?: Record<string, Texts>
}

/**
 * Renders a form from a typed schema (see ProjectSheet / ServiceRequest on
 * the server). Labels, hints and option names come from the locale, under
 * `${prefix}.${field.key}` (`label`, `hint`, `placeholder`, `unit`,
 * `options.<value>`, and `item.<key>` for lists). Adding an option on the
 * server and in the locale file is all it takes to show it here.
 * `aside` adds something under a field's label (an AI's proposal…).
 */
export function SchemaFields({ fields, values, onChange, prefix, disabled = false, aside }: {
  fields: SchemaField[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  prefix: string
  disabled?: boolean
  aside?: (field: SchemaField, texts: Texts) => ReactNode
}) {
  return (
    <div className="space-y-6">
      {fields.filter((f) => !f.hidden).map((field) => {
        const texts = translations(`${prefix}.${field.key}`) as Texts
        return (
          <FieldBlock
            key={field.key}
            field={field}
            texts={texts}
            value={values[field.key]}
            onChange={(v) => onChange(field.key, v)}
            disabled={disabled}
            aside={aside?.(field, texts)}
          />
        )
      })}
    </div>
  )
}

function FieldBlock({ field, texts, value, onChange, disabled, aside }: {
  field: SchemaField; texts: Texts; value: unknown; onChange: (v: unknown) => void; disabled: boolean; aside?: ReactNode
}) {
  const id = useId()
  const grouped = field.type === 'multi' || field.type === 'enum' || field.type === 'list'
  const hint = texts.hint && <p id={`${id}-hint`} className="mt-0.5 text-xs text-loam-500">{texts.hint}</p>
  const label = (as: 'legend' | 'label') => {
    const className = 'block text-sm font-medium text-loam-800'
    return as === 'legend'
      ? <legend className={className}>{texts.label}</legend>
      : <label htmlFor={id} className={className}>{texts.label}</label>
  }

  if (grouped) {
    return (
      <fieldset disabled={disabled} className="min-w-0" aria-describedby={texts.hint ? `${id}-hint` : undefined}>
        {label('legend')}
        {hint}
        {aside}
        <div className="mt-2">
          {field.type === 'multi' && <MultiField field={field} texts={texts} value={value} onChange={onChange} disabled={disabled} />}
          {field.type === 'enum' && <EnumField field={field} texts={texts} value={value} onChange={onChange} disabled={disabled} />}
          {field.type === 'list' && <ListField field={field} texts={texts} value={value} onChange={onChange} disabled={disabled} />}
        </div>
      </fieldset>
    )
  }

  return (
    <div>
      {field.type !== 'boolean' && label('label')}
      {field.type !== 'boolean' && hint}
      {aside}
      <div className={field.type === 'boolean' ? '' : 'mt-1.5'}>
        {field.type === 'text' && (field.limit ?? 2000) <= 200 && (
          <Input
            id={id} type="text" value={(value as string) ?? ''} maxLength={field.limit} disabled={disabled}
            placeholder={texts.placeholder} aria-describedby={texts.hint ? `${id}-hint` : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {field.type === 'text' && (field.limit ?? 2000) > 200 && (
          <Textarea
            id={id} rows={3} value={(value as string) ?? ''} maxLength={field.limit} disabled={disabled}
            placeholder={texts.placeholder} aria-describedby={texts.hint ? `${id}-hint` : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {field.type === 'integer' && (
          <div className="flex items-center gap-2">
            <Input
              id={id} type="number" inputMode="numeric" className="w-28!"
              min={field.range?.[0]} max={field.range?.[1]} step={1} disabled={disabled}
              value={value == null ? '' : String(value)}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            />
            {texts.unit && <span className="text-sm text-loam-500">{texts.unit}</span>}
          </div>
        )}
        {field.type === 'boolean' && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-loam-800">
            <input
              type="checkbox" checked={value === true} disabled={disabled}
              onChange={(e) => onChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
            />
            <span>{texts.label}</span>
          </label>
        )}
      </div>
    </div>
  )
}

function Chip({ kind, name, checked, disabled, onToggle, children }: {
  kind: 'checkbox' | 'radio'; name?: string; checked: boolean; disabled: boolean; onToggle: () => void; children: ReactNode
}) {
  return (
    <label
      className={clsx(
        'relative inline-flex select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition-colors',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-prune-600',
        checked ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200',
        disabled ? 'cursor-default opacity-70' : 'cursor-pointer ' + (checked ? 'hover:bg-prune-700' : 'hover:bg-loam-50'),
      )}
    >
      <input
        type={kind} name={name} checked={checked} disabled={disabled} className="sr-only"
        // A radio cannot be unchecked by clicking it: do it by hand so a choice can be cleared.
        onClick={kind === 'radio' ? onToggle : undefined}
        onChange={kind === 'checkbox' ? onToggle : () => undefined}
      />
      {checked && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span>{children}</span>
    </label>
  )
}

function MultiField({ field, texts, value, onChange, disabled }: {
  field: SchemaField; texts: Texts; value: unknown; onChange: (v: unknown) => void; disabled: boolean
}) {
  const current = Array.isArray(value) ? (value as string[]) : []
  function toggle(option: string) {
    if (current.includes(option)) return onChange(current.filter((v) => v !== option))
    const exclusive = field.exclusive ?? []
    if (exclusive.includes(option)) return onChange([option])
    onChange([...current.filter((v) => !exclusive.includes(v)), option])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(field.values ?? []).map((option) => (
        <Chip key={option} kind="checkbox" checked={current.includes(option)} disabled={disabled} onToggle={() => toggle(option)}>
          {texts.options?.[option] ?? option}
        </Chip>
      ))}
    </div>
  )
}

function EnumField({ field, texts, value, onChange, disabled }: {
  field: SchemaField; texts: Texts; value: unknown; onChange: (v: unknown) => void; disabled: boolean
}) {
  const name = useId()
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {(field.values ?? []).map((option) => (
        <Chip
          key={option} kind="radio" name={name} checked={value === option} disabled={disabled}
          onToggle={() => onChange(value === option ? null : option)}
        >
          {texts.options?.[option] ?? option}
        </Chip>
      ))}
    </div>
  )
}

type Row = Record<string, unknown>

function ListField({ field, texts, value, onChange, disabled }: {
  field: SchemaField; texts: Texts; value: unknown; onChange: (v: unknown) => void; disabled: boolean
}) {
  const rows = Array.isArray(value) ? (value as Row[]) : []
  const itemFields = (field.item ?? []).filter((f) => !f.hidden)
  const main = itemFields.filter((f) => f.key !== 'note')
  const note = itemFields.find((f) => f.key === 'note')
  const canAdd = !disabled && rows.length < (field.max ?? 20)

  const update = (index: number, key: string, v: unknown) =>
    onChange(rows.map((row, i) => {
      if (i !== index) return row
      const next = { ...row }
      if (v == null || v === '') delete next[key]
      else next[key] = v
      return next
    }))

  function add() {
    const row: Row = { name: '' }
    if (itemFields.some((f) => f.key === 'quantity')) row.quantity = 1
    onChange([...rows, row])
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="rounded-lg bg-loam-50 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {main.map((item) => {
              const itemTexts = texts.item?.[item.key] ?? {}
              const label = itemTexts.label ?? item.key
              if (item.type === 'enum') {
                return (
                  <Select
                    key={item.key} aria-label={label} className="w-auto! min-w-0 flex-1 basis-32" disabled={disabled}
                    value={(row[item.key] as string) ?? ''}
                    onChange={(e) => update(index, item.key, e.target.value || null)}
                  >
                    <option value="">{label}</option>
                    {(item.values ?? []).map((v) => <option key={v} value={v}>{itemTexts.options?.[v] ?? v}</option>)}
                  </Select>
                )
              }
              if (item.type === 'integer') {
                return (
                  <Input
                    key={item.key} aria-label={label} placeholder={label} type="number" inputMode="numeric"
                    className="w-20! shrink-0" min={item.range?.[0]} max={item.range?.[1]} disabled={disabled}
                    value={row[item.key] == null ? '' : String(row[item.key])}
                    onChange={(e) => update(index, item.key, e.target.value === '' ? null : Number(e.target.value))}
                  />
                )
              }
              return (
                <Input
                  key={item.key} aria-label={label} placeholder={label} maxLength={item.limit} disabled={disabled}
                  className="min-w-0 flex-1 basis-40" value={(row[item.key] as string) ?? ''}
                  onChange={(e) => update(index, item.key, e.target.value)}
                />
              )
            })}
            {!disabled && (
              <button
                type="button" aria-label={texts.remove} title={texts.remove}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                className="rounded-md p-1.5 text-loam-500 hover:bg-loam-100 hover:text-clay-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          {note && (
            <Input
              aria-label={texts.item?.note?.label} placeholder={texts.item?.note?.label} maxLength={note.limit}
              disabled={disabled} className="mt-2" value={(row.note as string) ?? ''}
              onChange={(e) => update(index, 'note', e.target.value)}
            />
          )}
        </div>
      ))}
      {canAdd && (
        <button
          type="button" onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-prune-700 ring-1 ring-inset ring-prune-200 hover:bg-prune-50"
        >
          <Plus className="h-4 w-4" />
          {texts.add}
        </button>
      )}
    </div>
  )
}

/** A value in words, with the labels of the locale: « Moins de 500 € », « Marie (porteuse) ». */
export function describeValue(field: SchemaField, texts: Texts, value: unknown): string {
  if (value == null) return ''
  switch (field.type) {
    case 'enum': return texts.options?.[value as string] ?? String(value)
    case 'multi': return (value as string[]).map((v) => texts.options?.[v] ?? v).join(', ')
    case 'integer': return texts.unit ? `${value} ${texts.unit}` : String(value)
    case 'boolean': return value === true ? (texts.label ?? '') : ''
    case 'list': return (value as Record<string, unknown>[]).map((row) => {
      const parts = (field.item ?? []).filter((f) => !f.hidden && f.key !== 'name' && row[f.key] != null)
        .map((f) => describeValue(f, texts.item?.[f.key] ?? {}, row[f.key]))
      return parts.length ? `${String(row.name ?? '')} (${parts.join(', ')})` : String(row.name ?? '')
    }).join(' · ')
    default: return String(value)
  }
}
