import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { Car, Clock, FileText, Pencil, Plus, Sprout, Sparkles, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { IconButton } from '@/components/ui/IconButton'
import { Pill, type PillTone } from '@/components/ui/Pill'
import { confirmAction } from '@/components/ui/confirm'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { tf } from '@/lib/content'
import { formatNumber, t } from '@/lib/i18n'
import { amountInput, formatDate, formatEuros, formatHours } from './format'
import type { BudgetItem, BudgetItemKey, BudgetStatus, ProjectBudget, ProjectInvoice } from './types'

const ITEMS: BudgetItemKey[] = ['services', 'expenses', 'plants', 'implementation']
const statusTone: Record<BudgetStatus, PillTone> = { not_invoiced: 'neutral', partly: 'humus', invoiced: 'leaf', over: 'clay' }

/** « 1 250,50 » → 125050; 0 for an empty field; null when unreadable. */
function parseCents(text: string): number | null {
  const value = text.trim().replace(/[\s  €]/g, '').replace(',', '.')
  if (!value) return 0
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  return Math.round(Number(value) * 100)
}

type Props = {
  mapId: number
  budget: ProjectBudget
  invoices: ProjectInvoice[]
  today: string
  canWrite: boolean
  onChanged: () => void
}

/**
 * « Budget du projet »: the four items every project's budget is made of
 * (prestations, frais, plantes, mise en œuvre), each with what was planned,
 * what was done and what the client was already invoiced, then the invoices
 * sent from the team's own tool, recorded here with their PDF.
 */
export function BudgetSection({ mapId, budget, invoices, today, canWrite, onChanged }: Props) {
  const [adding, setAdding] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  const { totals } = budget

  return (
    <section aria-labelledby="budget" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="budget" className="font-serif text-xl font-semibold text-prune-800">
          {t('time_entries.budget.title')}
          {budget.version && <span className="ml-2 font-sans text-sm font-normal text-loam-500">{t('time_entries.budget.from_version', { version: budget.version.label })}</span>}
        </h2>
        {canWrite && <Button variant="ghost" size="sm" onClick={() => setEditingBudget(true)}><Pencil className="h-4 w-4" aria-hidden />{t('time_entries.budget.edit')}</Button>}
      </header>
      <p className="mt-1 text-sm text-loam-600">{tf('time_entries.budget.intro')}</p>
      {!budget.version && totals.budgetCents == null && <p className="mt-2 text-sm text-humus-700">{tf('time_entries.budget.no_offer')}</p>}

      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-serif text-3xl font-semibold leading-none tabular-nums text-prune-800">
          {totals.budgetCents != null ? t('time_entries.budget.total_budget', { amount: formatEuros(totals.budgetCents, true) }) : t('time_entries.budget.total_none')}
        </span>
        <span className="text-loam-700">{t('time_entries.budget.total_invoiced', { amount: formatEuros(totals.invoicedCents, true) })}</span>
        {totals.leftToInvoiceCents != null && totals.leftToInvoiceCents > 0 && <span className="text-loam-500">{t('time_entries.budget.total_left', { amount: formatEuros(totals.leftToInvoiceCents, true) })}</span>}
      </p>
      {totals.unpaidCents > 0 && <p className="mt-1 text-sm text-humus-700">{t('time_entries.budget.total_unpaid', { amount: formatEuros(totals.unpaidCents, true) })}</p>}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {budget.items.map((item) => <ItemCard key={item.key} item={item} mapId={mapId} />)}
      </ul>

      <div className="mt-6 border-t border-loam-900/5 pt-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-semibold text-prune-800">{t('time_entries.invoices.title')}</h3>
          {canWrite && invoices.length > 0 && <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />{t('time_entries.invoices.add')}</Button>}
        </header>
        <p className="mt-1 text-sm text-loam-600">{tf('time_entries.invoices.intro')}</p>
        {invoices.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title={tf('time_entries.invoices.empty_title')}
              action={canWrite ? <Button variant="secondary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />{t('time_entries.invoices.add')}</Button> : undefined}
            >{tf('time_entries.invoices.empty')}</EmptyState>
          </div>
        ) : (
          <InvoiceList mapId={mapId} invoices={invoices} budget={budget} today={today} canWrite={canWrite} onChanged={onChanged} />
        )}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title={t('time_entries.invoices.form.new_title')} dismissOnBackdrop={false}>
        {adding && <InvoiceForm mapId={mapId} budget={budget} today={today} onDone={() => { setAdding(false); onChanged() }} onCancel={() => setAdding(false)} />}
      </Dialog>
      <Dialog open={editingBudget} onClose={() => setEditingBudget(false)} title={t('time_entries.budget.edit_title')} dismissOnBackdrop={false}>
        {editingBudget && <BudgetForm mapId={mapId} budget={budget} onDone={() => { setEditingBudget(false); onChanged() }} onCancel={() => setEditingBudget(false)} />}
      </Dialog>
    </section>
  )
}

/** One item: invoiced against its budget, what was done, what is left. */
function ItemCard({ item, mapId }: { item: BudgetItem; mapId: number }) {
  const budget = item.budgetCents
  const scale = Math.max(budget ?? 0, item.invoicedCents, 1)
  return (
    <li className="rounded-xl bg-loam-50 p-3.5 ring-1 ring-loam-900/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-loam-900">{t(`time_entries.budget.items.${item.key}`)}</p>
          <p className="text-sm text-loam-500">{t(`time_entries.budget.item_hints.${item.key}`)}</p>
        </div>
        <Pill tone={statusTone[item.status]}>{t(`time_entries.budget.statuses.${item.status}`)}</Pill>
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-lg font-semibold tabular-nums text-loam-900">{t('time_entries.budget.invoiced', { amount: formatEuros(item.invoicedCents, true) })}</span>
        <span className="text-sm text-loam-500">
          {budget != null ? t('time_entries.budget.budgeted', { amount: formatEuros(budget, true) }) : t('time_entries.budget.no_budget')}
          {item.budgetSource === 'manual' && ` · ${t('time_entries.budget.manual')}`}
        </span>
      </p>
      {budget != null && budget > 0 && (
        <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white ring-1 ring-loam-900/5" aria-hidden>
          <div className={clsx('absolute inset-y-0 left-0 rounded-full', item.status === 'over' ? 'bg-clay-500' : 'bg-prune-500')} style={{ width: `${Math.min(100, (item.invoicedCents / scale) * 100)}%` }} />
        </div>
      )}
      <ul className="mt-2 space-y-0.5 text-sm text-loam-600">
        {item.hours && (
          <li className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-loam-400" aria-hidden />
            {item.hours.envelope != null
              ? t('time_entries.budget.done_hours', { done: formatHours(item.hours.done), envelope: formatHours(item.hours.envelope) })
              : t('time_entries.budget.done_hours_free', { done: formatHours(item.hours.done) })}
          </li>
        )}
        {item.spentCents != null && item.spentCents > 0 && <li>{t('time_entries.budget.spent', { amount: formatEuros(item.spentCents, true) })}</li>}
        {item.km != null && item.km > 0 && <li className="inline-flex items-center gap-1.5"><Car className="h-3.5 w-3.5 text-loam-400" aria-hidden />{t('time_entries.budget.km', { km: formatNumber(item.km) })}</li>}
        {item.leftToInvoiceCents != null && item.leftToInvoiceCents > 0 && <li className="font-medium text-loam-800">{t('time_entries.budget.left', { amount: formatEuros(item.leftToInvoiceCents, true) })}</li>}
      </ul>
      {item.overBudget && <p className="mt-1 -rotate-1 font-hand text-xl leading-tight text-clay-700">{item.spentCents != null && item.budgetCents != null && item.spentCents > item.budgetCents ? t('time_entries.budget.over_spent') : t('time_entries.budget.over_hours')}</p>}
      {item.plantsLeft && item.plantsLeft.cents > 0 && (
        <div className="mt-2">
          <HandNote tone="leaf">
            <Sprout className="mr-1 inline h-4 w-4" aria-hidden />
            {item.plantsLeft.count
              ? t('time_entries.budget.plants_left', { amount: formatEuros(item.plantsLeft.cents, true), count: formatNumber(item.plantsLeft.count) })
              : t('time_entries.budget.plants_left_plain', { amount: formatEuros(item.plantsLeft.cents, true) })}
          </HandNote>
          <Link href={`/maps/${mapId}/implementation`} className="mt-1 inline-block text-sm font-medium text-prune-700 hover:underline">{t('time_entries.budget.plants_go')}</Link>
        </div>
      )}
    </li>
  )
}

function InvoiceList({ mapId, invoices, budget, today, canWrite, onChanged }: { mapId: number; invoices: ProjectInvoice[]; budget: ProjectBudget; today: string; canWrite: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<ProjectInvoice | null>(null)

  async function remove(invoice: ProjectInvoice) {
    const ok = await confirmAction({
      title: t('time_entries.invoices.delete_title'),
      body: t('time_entries.invoices.delete_body', { number: invoice.number, date: formatDate(invoice.issuedOn), amount: formatEuros(invoice.amountCents) }),
      confirmLabel: t('time_entries.invoices.delete'),
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api(`/maps/${mapId}/invoices/${invoice.id}`, { method: 'DELETE' })
      toast(t('time_entries.invoices.deleted'))
      onChanged()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    }
  }

  return (
    <>
      <ul className="mt-3 divide-y divide-loam-900/5">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="group flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-[15px] leading-snug text-loam-900">
                  <span className="font-medium">{invoice.number}</span>
                  <span className="text-loam-500"> · {formatDate(invoice.issuedOn)}</span>
                </p>
                <p className="shrink-0 text-right font-semibold tabular-nums text-loam-900">{formatEuros(invoice.amountCents)}</p>
              </div>
              <p className="mt-0.5 text-sm text-loam-600">
                {ITEMS.filter((key) => invoice.items[key] > 0).map((key) => `${t(`time_entries.budget.items.${key}`)} ${formatEuros(invoice.items[key], true)}`).join(' · ')}
              </p>
              {invoice.note && <p className="mt-0.5 text-sm text-loam-600">{invoice.note}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Pill tone={invoice.paid ? 'leaf' : 'humus'}>{invoice.paidOn ? t('time_entries.invoices.paid', { date: formatDate(invoice.paidOn) }) : t('time_entries.invoices.unpaid')}</Pill>
                {invoice.document?.url && (
                  <a href={invoice.document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
                    <FileText className="h-3.5 w-3.5" aria-hidden />{t('time_entries.invoices.document')}
                  </a>
                )}
                {invoice.source === 'mcp' && <span className="inline-flex items-center gap-1 text-sm text-loam-500"><Sparkles className="h-3.5 w-3.5" aria-hidden />{t('time_entries.invoices.by_ai')}</span>}
                <span className="ml-auto text-sm tabular-nums text-loam-500">{t('time_entries.invoices.vat_line', { vat: formatEuros(invoice.vatCents), total: formatEuros(invoice.totalCents) })}</span>
              </div>
            </div>
            {canWrite && (
              <div className="flex shrink-0 gap-0.5 transition-opacity sm:opacity-40 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <IconButton size="sm" label={t('time_entries.invoices.edit')} onClick={() => setEditing(invoice)}><Pencil /></IconButton>
                <IconButton size="sm" tone="danger" label={t('time_entries.invoices.delete')} onClick={() => void remove(invoice)}><Trash2 /></IconButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={editing != null} onClose={() => setEditing(null)} title={t('time_entries.invoices.form.edit_title')} dismissOnBackdrop={false}>
        {editing && <InvoiceForm mapId={mapId} budget={budget} today={today} invoice={editing} onDone={() => { setEditing(null); onChanged() }} onCancel={() => setEditing(null)} />}
      </Dialog>
    </>
  )
}

const defaultVat = (cents: Record<BudgetItemKey, number>) =>
  ITEMS.reduce((sum, key) => sum + Math.round((cents[key] * (key === 'plants' ? 6 : 21)) / 100), 0)

/**
 * « Enregistrer une facture »: its number and date, its amount before VAT
 * item by item (a new one starts from what is left to invoice), the VAT as
 * written on it, paid or not, and its PDF.
 */
function InvoiceForm({ mapId, budget, today, invoice, onDone, onCancel }: { mapId: number; budget: ProjectBudget; today: string; invoice?: ProjectInvoice; onDone: () => void; onCancel: () => void }) {
  const start = (key: BudgetItemKey) => {
    if (invoice) return invoice.items[key] > 0 ? amountInput(invoice.items[key]) : ''
    const left = budget.items.find((i) => i.key === key)?.leftToInvoiceCents ?? 0
    return left > 0 ? amountInput(left) : ''
  }
  const [number, setNumber] = useState(invoice?.number ?? '')
  const [issuedOn, setIssuedOn] = useState(invoice?.issuedOn ?? today)
  const [paidOn, setPaidOn] = useState(invoice?.paidOn ?? '')
  const [amounts, setAmounts] = useState<Record<BudgetItemKey, string>>(() => Object.fromEntries(ITEMS.map((k) => [k, start(k)])) as Record<BudgetItemKey, string>)
  const [vat, setVat] = useState(invoice ? amountInput(invoice.vatCents) : '')
  const [vatTouched, setVatTouched] = useState(invoice != null)
  const [note, setNote] = useState(invoice?.note ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [removeDocument, setRemoveDocument] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  const cents = Object.fromEntries(ITEMS.map((k) => [k, parseCents(amounts[k]) ?? 0])) as Record<BudgetItemKey, number>
  const amount = ITEMS.reduce((sum, k) => sum + cents[k], 0)
  const vatCents = vatTouched ? (parseCents(vat) ?? 0) : defaultVat(cents)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const unreadable = ITEMS.filter((k) => parseCents(amounts[k]) == null)
    if (unreadable.length > 0 || amount === 0) {
      setErrors(unreadable.length > 0
        ? Object.fromEntries(unreadable.map((k) => [`${k}_cents`, [t('time_entries.budget.errors.amount')]]))
        : { base: [t('time_entries.invoices.form.amount_hint')] })
      return
    }
    setSaving(true)
    const body = new FormData()
    body.append('invoice[number]', number)
    body.append('invoice[issued_on]', issuedOn)
    body.append('invoice[paid_on]', paidOn)
    body.append('invoice[note]', note)
    body.append('invoice[vat]', (vatCents / 100).toFixed(2))
    ITEMS.forEach((k) => body.append(`invoice[items][${k}]`, (cents[k] / 100).toFixed(2)))
    if (file) body.append('invoice[document]', file)
    if (removeDocument && !file) body.append('invoice[remove_document]', 'true')
    try {
      await api(invoice ? `/maps/${mapId}/invoices/${invoice.id}` : `/maps/${mapId}/invoices`, { method: invoice ? 'PATCH' : 'POST', body })
      toast(invoice ? t('time_entries.invoices.updated') : t('time_entries.invoices.saved', { number }), { tone: 'success' })
      onDone()
    } catch (e) {
      if (e instanceof ApiError && e.data.errors) setErrors(e.data.errors as Record<string, string[]>)
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const keepsDocument = invoice?.document && !removeDocument && !file

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={t(invoice ? 'time_entries.invoices.form.edit_title' : 'time_entries.invoices.form.new_title')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('time_entries.invoices.form.number')} error={errors.number}>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={t('time_entries.invoices.form.number_placeholder')} maxLength={60} required autoFocus={!invoice} />
        </Field>
        <Field label={t('time_entries.invoices.form.issued_on')} error={errors.issued_on}>
          <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} required />
        </Field>
        <Field label={t('time_entries.invoices.form.paid_on')} hint={t('time_entries.invoices.form.paid_on_hint')} error={errors.paid_on}>
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-loam-800">{t('time_entries.invoices.form.items')}</legend>
        <p className="mt-0.5 text-sm text-loam-500">{t('time_entries.invoices.form.items_hint')}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {ITEMS.map((key) => (
            <Field key={key} label={t(`time_entries.budget.items.${key}`)} error={errors[`${key}_cents`]}>
              <Input inputMode="decimal" value={amounts[key]} onChange={(e) => setAmounts({ ...amounts, [key]: e.target.value })} placeholder="0" />
            </Field>
          ))}
        </div>
        {errors.base && <p className="mt-1 text-sm text-clay-700">{errors.base.join(', ')}</p>}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('time_entries.invoices.form.vat')} hint={t('time_entries.invoices.form.vat_hint')} error={errors.vat_cents}>
          <Input inputMode="decimal" value={vatTouched ? vat : amountInput(vatCents)} onChange={(e) => { setVat(e.target.value); setVatTouched(true) }} />
        </Field>
        <p className="self-center text-sm font-medium tabular-nums text-loam-800 sm:pt-5">
          {t('time_entries.invoices.form.total', { amount: formatEuros(amount), total: formatEuros(amount + vatCents) })}
        </p>
      </div>

      <Field label={t('time_entries.invoices.form.note')} hint={t('time_entries.invoices.form.note_hint')} error={errors.note}>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>

      <div className="rounded-xl bg-loam-50 p-3 ring-1 ring-loam-900/10">
        <p className="flex items-center gap-2 text-sm font-medium text-loam-800"><FileText className="h-4 w-4 text-loam-500" aria-hidden />{t('time_entries.invoices.form.document')}</p>
        {keepsDocument ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-loam-700">
            {t('time_entries.invoices.form.document_keep', { name: invoice!.document!.name })}
            <Button variant="ghost" size="sm" onClick={() => setRemoveDocument(true)}>{t('time_entries.invoices.form.document_remove')}</Button>
          </p>
        ) : (
          <input
            type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-sm text-loam-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3.5 file:py-1.5 file:text-sm file:font-medium file:text-prune-800 file:ring-1 file:ring-loam-900/10 hover:file:bg-loam-100"
            aria-label={t('time_entries.invoices.form.document_take')}
          />
        )}
        {errors.document && <p className="mt-1 text-sm text-clay-700">{errors.document.join(', ')}</p>}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{t('time_entries.invoices.form.cancel')}</Button>
        <Button type="submit" disabled={saving}>{t(invoice ? 'time_entries.invoices.form.update' : 'time_entries.invoices.form.save')}</Button>
      </div>
    </form>
  )
}

/** « Modifier les budgets »: an amount per item, empty to read the offer again. */
function BudgetForm({ mapId, budget, onDone, onCancel }: { mapId: number; budget: ProjectBudget; onDone: () => void; onCancel: () => void }) {
  const [values, setValues] = useState<Record<BudgetItemKey, string>>(() =>
    Object.fromEntries(budget.items.map((i) => [i.key, i.budgetSource === 'manual' && i.budgetCents != null ? amountInput(i.budgetCents) : ''])) as Record<BudgetItemKey, string>)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const unreadable = ITEMS.filter((k) => parseCents(values[k]) == null)
    if (unreadable.length > 0) {
      setErrors(Object.fromEntries(unreadable.map((k) => [k, [t('time_entries.budget.errors.amount')]])))
      return
    }
    setSaving(true)
    const items = Object.fromEntries(ITEMS.map((k) => [k, values[k].trim() === '' ? '' : ((parseCents(values[k]) ?? 0) / 100).toFixed(2)]))
    try {
      await api(`/maps/${mapId}/budget`, { method: 'PATCH', body: { items } })
      toast(t('time_entries.budget.saved'), { tone: 'success' })
      onDone()
    } catch (e) {
      if (e instanceof ApiError && e.data.errors) setErrors(e.data.errors as Record<string, string[]>)
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={t('time_entries.budget.edit_title')}>
      <p className="text-sm text-loam-600">{t('time_entries.budget.edit_intro')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {budget.items.map((item) => (
          <Field
            key={item.key} label={t(`time_entries.budget.items.${item.key}`)} error={errors[item.key]}
            hint={item.offerCents != null ? t('time_entries.budget.offer_amount', { amount: formatEuros(item.offerCents) }) : t('time_entries.budget.no_offer_amount')}
          >
            <Input inputMode="decimal" value={values[item.key]} onChange={(e) => setValues({ ...values, [item.key]: e.target.value })} placeholder={item.offerCents != null ? amountInput(item.offerCents) : ''} />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{t('time_entries.budget.cancel')}</Button>
        <Button type="submit" disabled={saving}>{t('time_entries.budget.save')}</Button>
      </div>
    </form>
  )
}
