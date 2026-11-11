import clsx from 'clsx'
import { Eye, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { ExpenseForm, payerLabel } from './ExpenseForm'
import { ExpenseList } from './ExpenseList'
import { formatEuros } from './format'
import type { Expense, ExpenseCatalog, ExpenseSummary } from './types'

type Props = {
  mapId: number
  expenses: Expense[]
  summary: ExpenseSummary
  catalog: ExpenseCatalog
  today: string
  teamName?: string | null
  canWrite: boolean
  onChanged: () => void
}

/**
 * « Dépenses »: what the project cost besides time, group by group against
 * the accepted offer (plants, supplies, the rest), what each payer carries,
 * then every line.
 */
export function ExpensesSection({ mapId, expenses, summary, catalog, today, teamName, canWrite, onChanged }: Props) {
  const [adding, setAdding] = useState(false)
  const suppliers = expenses.map((e) => e.supplier).filter((s): s is string => !!s)
  const add = canWrite && (
    <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />{t('time_entries.expenses.add')}</Button>
  )

  return (
    <section aria-labelledby="expenses" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="expenses" className="font-serif text-xl font-semibold text-prune-800">{t('time_entries.expenses.title')}</h2>
        {expenses.length > 0 && add}
      </header>
      <p className="mt-1 text-sm text-loam-600">{tf('time_entries.expenses.intro')}</p>

      {expenses.length === 0 ? (
        <div className="mt-3"><EmptyState title={tf('time_entries.expenses.empty_title')} action={add || undefined}>{tf('time_entries.expenses.empty')}</EmptyState></div>
      ) : (
        <>
          <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
            <div>
              <p className="font-serif text-3xl font-semibold leading-none tabular-nums text-prune-800">{t('time_entries.expenses.total', { amount: formatEuros(summary.totals.amountCents, true) })}</p>
              <p className="mt-1 text-sm text-loam-500">{formatEuros(summary.totals.totalCents, true)} TVAC</p>
              {summary.byGroup.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {summary.byGroup.map((group) => <GroupBar key={group.group} group={group} />)}
                </ul>
              )}
            </div>
            <ul className="space-y-1.5 self-start rounded-xl bg-loam-50 p-3 text-sm ring-1 ring-loam-900/10">
              {summary.byPayer.map((line) => (
                <li key={line.paidBy} className="flex items-baseline justify-between gap-3">
                  <span className="text-loam-700">{payerLabel(line.paidBy, teamName)}</span>
                  <span className="font-semibold tabular-nums text-loam-900">{formatEuros(line.amountCents, true)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4">
            <ExpenseList mapId={mapId} expenses={expenses} catalog={catalog} today={today} teamName={teamName} canWrite={canWrite} onChanged={onChanged} />
          </div>
        </>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title={t('time_entries.expenses.new_title')} dismissOnBackdrop={false}>
        {adding && (
          <ExpenseForm
            mapId={mapId} catalog={catalog} today={today} teamName={teamName} suppliers={suppliers}
            onDone={() => { setAdding(false); onChanged() }}
            onCancel={() => setAdding(false)}
          />
        )}
      </Dialog>
    </section>
  )
}

function GroupBar({ group }: { group: ExpenseSummary['byGroup'][number] }) {
  const planned = group.plannedCents ?? 0
  const scale = Math.max(planned, group.amountCents, 1)
  const over = group.overCents != null && group.overCents > 0
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium text-loam-900">{t(`time_entries.expenses.groups.${group.group}`)}</span>
        <span className="tabular-nums text-loam-700">
          {formatEuros(group.amountCents, true)}
          {planned > 0 && <span className="text-loam-500"> {t('time_entries.expenses.planned', { amount: formatEuros(planned, true) })}</span>}
        </span>
      </div>
      {planned > 0 && (
        <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-loam-100" aria-hidden>
          <div className={clsx('absolute inset-y-0 left-0 rounded-full', over ? 'bg-clay-500' : 'bg-leaf-500')} style={{ width: `${(group.amountCents / scale) * 100}%` }} />
          {over && <div className="absolute inset-y-0 w-0.5 bg-loam-900/60" style={{ left: `${(planned / scale) * 100}%` }} />}
        </div>
      )}
      {over && <p className="mt-0.5 text-sm text-clay-700">{t('time_entries.expenses.over', { amount: formatEuros(group.overCents!, true) })}</p>}
    </li>
  )
}

/** « Montrer au client »: one switch, with what it opens and to whom. */
export function SharingCard({ mapId, shared, hasViewers, onChanged }: { mapId: number; shared: boolean; hasViewers: boolean; onChanged: () => void }) {
  const [on, setOn] = useState(shared)
  const [saving, setSaving] = useState(false)

  async function toggle(next: boolean) {
    setOn(next)
    setSaving(true)
    try {
      await api(`/maps/${mapId}/time_sharing`, { method: 'PATCH', body: { shared: next } })
      toast(t(next ? 'time_entries.sharing.turned_on' : 'time_entries.sharing.turned_off'), { tone: 'success' })
      onChanged()
    } catch (e) {
      setOn(!next)
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="sharing" className={clsx('mt-6 rounded-2xl p-4 ring-1 sm:p-5', on ? 'bg-leaf-50 ring-leaf-700/20' : 'bg-white shadow-sm ring-loam-900/10')}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox" role="switch" checked={on} disabled={saving} onChange={(e) => void toggle(e.target.checked)}
          className="peer sr-only"
        />
        <span aria-hidden className={clsx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-prune-600', on ? 'bg-leaf-600' : 'bg-loam-300')}>
          <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
        </span>
        <span className="min-w-0">
          <span id="sharing" className="flex items-center gap-1.5 font-medium text-loam-900"><Eye className="h-4 w-4 text-loam-500" aria-hidden />{t('time_entries.sharing.title')}</span>
          <span className="mt-0.5 block text-sm text-loam-600">{t(on ? 'time_entries.sharing.on' : 'time_entries.sharing.off')}</span>
          {!hasViewers && <span className="mt-1 block text-sm text-loam-500">{t('time_entries.sharing.no_viewers')}</span>}
        </span>
      </label>
    </section>
  )
}
