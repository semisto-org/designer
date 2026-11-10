import { Paperclip, Pencil, Smartphone, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Pill } from '@/components/ui/Pill'
import { confirmAction } from '@/components/ui/confirm'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { ExpenseForm, payerLabel } from './ExpenseForm'
import { formatDate, formatDay, formatEuros } from './format'
import type { Expense, ExpenseCatalog, Payer } from './types'

const payerTone: Record<Payer, 'prune' | 'leaf' | 'humus' | 'neutral'> = { rebilled: 'prune', team: 'neutral', client: 'leaf', designer: 'humus' }

type Props = {
  mapId: number
  expenses: Expense[]
  catalog: ExpenseCatalog
  today: string
  teamName?: string | null
  /** The client's page: payers named from their side, only their own lines change. */
  client?: boolean
  canWrite: boolean
  onChanged: () => void
}

/** The project's expenses, newest first: what, who paid, how much before VAT. */
export function ExpenseList({ mapId, expenses, catalog, today, teamName, client = false, canWrite, onChanged }: Props) {
  const [editing, setEditing] = useState<Expense | null>(null)
  const suppliers = expenses.map((e) => e.supplier).filter((s): s is string => !!s)

  async function remove(expense: Expense) {
    const ok = await confirmAction({
      title: t('time_entries.expenses.delete_title'),
      body: t('time_entries.expenses.delete_body', { label: expense.label, amount: formatEuros(expense.amountCents), date: formatDate(expense.spentOn) }),
      confirmLabel: t('time_entries.expenses.delete'),
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api(`/maps/${mapId}/expenses/${expense.id}`, { method: 'DELETE' })
      toast(t('time_entries.expenses.deleted'))
      onChanged()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    }
  }

  return (
    <>
      <ul className="divide-y divide-loam-900/5">
        {expenses.map((expense) => {
          const editable = canWrite && (!client || expense.mine)
          return (
            <li key={expense.id} className="group flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1 sm:flex sm:gap-3">
                <div className="shrink-0 text-sm text-loam-500 first-letter:uppercase sm:w-24 sm:pt-0.5">{formatDay(expense.spentOn)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-[15px] leading-snug text-loam-900">
                      <span className="font-medium">{expense.label}</span>
                      {expense.supplier && <span className="text-loam-500"> · {expense.supplier}</span>}
                    </p>
                    <p className="shrink-0 text-right font-semibold tabular-nums text-loam-900">{formatEuros(expense.amountCents)}</p>
                  </div>
                  {expense.note && <p className="mt-0.5 text-sm text-loam-600">{expense.note}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Pill>{t(`time_entries.expenses.categories.${expense.category}`)}</Pill>
                    <Pill tone={payerTone[expense.paidBy]}>{payerLabel(expense.paidBy, teamName, client)}</Pill>
                    {expense.phase && !client && <span className="text-sm text-loam-500">{t(`time_entries.phases.${expense.phase}`)}</span>}
                    {expense.receipt?.url && (
                      <a href={expense.receipt.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
                        <Paperclip className="h-3.5 w-3.5" aria-hidden />{t('time_entries.expenses.receipt')}
                      </a>
                    )}
                    {expense.source === 'mcp' && <span className="inline-flex items-center gap-1 text-sm text-loam-500"><Sparkles className="h-3.5 w-3.5" aria-hidden />{t('time_entries.expenses.by_ai')}</span>}
                    {expense.source === 'app' && <span className="inline-flex items-center gap-1 text-sm text-loam-500"><Smartphone className="h-3.5 w-3.5" aria-hidden />{t('time_entries.entry.by_app')}</span>}
                    <span className="ml-auto text-sm tabular-nums text-loam-500">{t('time_entries.expenses.vat_line', { rate: expense.vatRate, total: formatEuros(expense.totalCents) })}</span>
                  </div>
                </div>
              </div>
              {editable && (
                <div className="flex shrink-0 gap-0.5 transition-opacity sm:opacity-40 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <IconButton size="sm" label={t('time_entries.entry.edit')} onClick={() => setEditing(expense)}><Pencil /></IconButton>
                  <IconButton size="sm" tone="danger" label={t('time_entries.expenses.delete')} onClick={() => void remove(expense)}><Trash2 /></IconButton>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Dialog open={editing != null} onClose={() => setEditing(null)} title={t('time_entries.expenses.edit_title')} dismissOnBackdrop={false}>
        {editing && (
          <ExpenseForm
            mapId={mapId} catalog={catalog} today={today} teamName={teamName} client={client} suppliers={suppliers} expense={editing}
            onDone={() => { setEditing(null); onChanged() }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  )
}
