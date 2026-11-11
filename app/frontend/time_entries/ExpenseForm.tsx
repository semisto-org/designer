import clsx from 'clsx'
import { Paperclip } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipButton } from '@/components/ui/ChipButton'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { amountInput, formatEuros, parseAmount } from './format'
import type { Expense, ExpenseCatalog, ExpenseCategory, Payer, Phase } from './types'

type Props = {
  mapId: number
  catalog: ExpenseCatalog
  today: string
  /** The team's name, for « À charge de … ». */
  teamName?: string | null
  /** The client noting their own purchase: no payer or phase to choose. */
  client?: boolean
  /** Suppliers already used on this project. */
  suppliers?: string[]
  expense?: Expense
  onDone: (expense: Expense) => void
  onCancel?: () => void
}

export const payerLabel = (payer: Payer, teamName?: string | null, client = false) => {
  const scope = client ? 'client.payers' : 'expenses.payers'
  if (payer === 'team') return teamName ? t(`time_entries.${scope}.team`, { team: teamName }) : t(`time_entries.${scope}.team_fallback`)
  return t(`time_entries.${scope}.${payer}`)
}

const defaultVat = (category: ExpenseCategory) => (category === 'plants' ? 6 : 21)

/**
 * « Une dépense du projet »: what was bought, when, how much before VAT,
 * and who paid. The VAT rate follows the category (6 % for plants), and a
 * photographed ticket can go with it.
 */
export function ExpenseForm({ mapId, catalog, today, teamName, client = false, suppliers = [], expense, onDone, onCancel }: Props) {
  const id = useId()
  const [label, setLabel] = useState(expense?.label ?? '')
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? today)
  const [amount, setAmount] = useState(expense ? amountInput(expense.amountCents) : '')
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'plants')
  const [vatRate, setVatRate] = useState(expense?.vatRate ?? defaultVat(expense?.category ?? 'plants'))
  const [vatTouched, setVatTouched] = useState(expense != null)
  const [supplier, setSupplier] = useState(expense?.supplier ?? '')
  const [paidBy, setPaidBy] = useState<Payer>(expense?.paidBy ?? (client ? 'client' : 'rebilled'))
  const [phase, setPhase] = useState<Phase | ''>(expense?.phase ?? '')
  const [note, setNote] = useState(expense?.note ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  const cents = parseAmount(amount)
  const vatCents = cents ? Math.round((cents * vatRate) / 100) : 0

  function pickCategory(next: ExpenseCategory) {
    setCategory(next)
    if (!vatTouched) setVatRate(defaultVat(next))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!cents) {
      setErrors({ amount_cents: [t('time_entries.expenses.form.amount_hint')] })
      return
    }
    setSaving(true)
    const body = new FormData()
    const fields: Record<string, string> = {
      label, spent_on: spentOn, amount: (cents / 100).toFixed(2), category, vat_rate: String(vatRate),
      supplier, paid_by: client ? 'client' : paidBy, phase: client ? '' : phase, note,
    }
    Object.entries(fields).forEach(([key, value]) => body.append(`expense[${key}]`, value))
    if (file) body.append('expense[receipt]', file)
    if (removeReceipt && !file) body.append('expense[remove_receipt]', 'true')
    try {
      const result = expense
        ? await api<{ expense: Expense }>(`/maps/${mapId}/expenses/${expense.id}`, { method: 'PATCH', body })
        : await api<{ expense: Expense }>(`/maps/${mapId}/expenses`, { method: 'POST', body })
      setErrors({})
      toast(expense ? t('time_entries.expenses.updated') : t('time_entries.expenses.saved', { label, amount: formatEuros(cents) }), { tone: 'success' })
      onDone(result.expense)
    } catch (e) {
      if (e instanceof ApiError && e.data.errors) setErrors(e.data.errors as Record<string, string[]>)
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const payers = client ? [] : catalog.payers
  const keepsReceipt = expense?.receipt && !removeReceipt && !file

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={expense ? t('time_entries.expenses.edit_title') : t(client ? 'time_entries.expenses.new_title_client' : 'time_entries.expenses.new_title')}>
      <Field label={t('time_entries.expenses.form.label')} error={errors.label}>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('time_entries.expenses.form.label_placeholder')} maxLength={120} required autoFocus={!expense} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
        <Field label={t('time_entries.expenses.form.spent_on')} error={errors.spent_on}>
          <Input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} required />
        </Field>
        <Field
          label={t('time_entries.expenses.form.amount')}
          error={errors.amount_cents}
          hint={cents ? t('time_entries.expenses.form.totals_preview', { vat: formatEuros(vatCents), total: formatEuros(cents + vatCents) }) : t('time_entries.expenses.form.amount_hint')}
        >
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120,50" required />
        </Field>
        <Field label={t('time_entries.expenses.form.vat_rate')} error={errors.vat_rate}>
          <Select value={vatRate} onChange={(e) => { setVatRate(Number(e.target.value)); setVatTouched(true) }}>
            {catalog.vatRates.map((rate) => <option key={rate} value={rate}>{t('time_entries.expenses.form.vat_option', { rate })}</option>)}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('time_entries.expenses.form.category')} error={errors.category}>
          <Select value={category} onChange={(e) => pickCategory(e.target.value as ExpenseCategory)}>
            {catalog.categories.map((c) => <option key={c} value={c}>{t(`time_entries.expenses.categories.${c}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('time_entries.expenses.form.supplier')} error={errors.supplier}>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} list={`${id}-suppliers`} placeholder={t('time_entries.expenses.form.supplier_placeholder')} maxLength={120} />
          <datalist id={`${id}-suppliers`}>{[...new Set(suppliers)].map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
      </div>

      {payers.length > 0 && (
        <div>
          <p className="text-sm font-medium text-loam-800">{t('time_entries.expenses.form.paid_by')}</p>
          <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label={t('time_entries.expenses.form.paid_by')}>
            {payers.map((p) => (
              <ChipButton key={p} role="radio" aria-checked={paidBy === p} pressed={paidBy === p} onClick={() => setPaidBy(p)}>{payerLabel(p, teamName)}</ChipButton>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-loam-500">{t(`time_entries.expenses.payer_hints.${paidBy}`)}</p>
          {errors.paid_by && <p className="mt-1 text-sm text-clay-700">{errors.paid_by.join(', ')}</p>}
        </div>
      )}

      {!client && (
        <Field label={t('time_entries.expenses.form.phase')} error={errors.phase}>
          <Select value={phase} onChange={(e) => setPhase(e.target.value as Phase | '')}>
            <option value="">{t('time_entries.expenses.form.no_phase')}</option>
            {catalog.phases.map((p) => <option key={p} value={p}>{t(`time_entries.phases.${p}`)}</option>)}
          </Select>
        </Field>
      )}

      <Field label={t('time_entries.expenses.form.note')} error={errors.note}>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>

      <div className="rounded-xl bg-loam-50 p-3 ring-1 ring-loam-900/10">
        <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-loam-800">
          <Paperclip className="h-4 w-4 text-loam-500" aria-hidden />
          {t('time_entries.expenses.form.receipt')}
        </label>
        {keepsReceipt ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-loam-700">
            {t('time_entries.expenses.form.receipt_keep', { name: expense!.receipt!.name })}
            <ChipButton onClick={() => setRemoveReceipt(true)}>{t('time_entries.expenses.form.receipt_remove')}</ChipButton>
          </p>
        ) : (
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={clsx('mt-2 block w-full text-sm text-loam-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3.5 file:py-1.5 file:text-sm file:font-medium file:text-prune-800 file:ring-1 file:ring-loam-900/10 hover:file:bg-loam-100')}
            aria-label={t('time_entries.expenses.form.receipt_take')}
          />
        )}
        {errors.receipt && <p className="mt-1 text-sm text-clay-700">{errors.receipt.join(', ')}</p>}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t('time_entries.expenses.form.cancel')}</Button>}
        <Button type="submit" disabled={saving}>{t(expense ? 'time_entries.expenses.form.update' : 'time_entries.expenses.form.save')}</Button>
      </div>
    </form>
  )
}
