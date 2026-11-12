import { Head, router } from '@inertiajs/react'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { ExpenseForm, payerLabel } from '@/time_entries/ExpenseForm'
import { ExpenseList } from '@/time_entries/ExpenseList'
import { formatEuros, formatShortDate } from '@/time_entries/format'
import type { Expense, ExpenseCatalog, Payer, Phase } from '@/time_entries/types'

type Props = {
  map: { id: number; name: string; role: string; teamId: number | null; offerBuilder: boolean; teamName?: string | null; timeEntries: boolean }
  version: { label: string } | null
  phases: { key: Phase; pct: number; started: boolean; lastOn: string | null }[]
  expenses: Expense[]
  /** Amounts only on the client's own purchases: what the team bought comes without its price. */
  byPayer: { paidBy: Payer; amountCents: number | null; totalCents: number | null; count: number }[]
  /** The client's own purchases. */
  totals: { amountCents: number; vatCents: number; totalCents: number }
  canWrite: boolean
  expenseCatalog: ExpenseCatalog
  today: string
}

/**
 * The client's « Avancement du projet », once the team turned on « Montrer
 * au client »: how far each phase of the offer went, what was bought for the
 * garden and who paid, and their own purchases to add. Never names, hours
 * or rates.
 */
export default function ClientProgress({ map, version, phases, expenses, byPayer, totals, canWrite, expenseCatalog, today }: Props) {
  const [adding, setAdding] = useState(false)
  const reload = () => router.reload({ only: ['expenses', 'byPayer', 'totals'] })

  return (
    <div className="mx-auto max-w-3xl">
      <Head title={t('time_entries.client.page_title', { map: map.name })} />
      <MapViewHeader map={map} current="time" />
      <h1 className="text-3xl">{t('time_entries.client.title')}</h1>
      <p className="mt-1 text-loam-600">{map.teamName ? t('time_entries.client.intro', { team: map.teamName }) : t('time_entries.client.intro_no_team')}</p>

      <section aria-labelledby="phases" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="phases" className="font-serif text-xl font-semibold text-prune-800">{t('time_entries.client.phases_title')}</h2>
          {version && <p className="text-sm text-loam-500">{t('time_entries.client.from_version', { version: version.label })}</p>}
        </header>
        {phases.length === 0 ? (
          <p className="mt-2 text-sm text-loam-600">{t('time_entries.client.no_phases')}</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {phases.map((phase) => {
              const done = phase.pct >= 100
              return (
                <li key={phase.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium text-loam-900">{t(`time_entries.phases.${phase.key}`)}</p>
                    <p className={clsx('text-sm tabular-nums', done ? 'font-medium text-leaf-700' : 'text-loam-700')}>
                      {phase.started ? t('time_entries.client.pct', { pct: phase.pct }) : t('time_entries.client.not_started')}
                    </p>
                  </div>
                  <div
                    className="mt-1.5 h-3 overflow-hidden rounded-full bg-loam-100"
                    role="progressbar" aria-valuenow={phase.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t(`time_entries.phases.${phase.key}`)}
                  >
                    <div className={clsx('h-full rounded-full', done ? 'bg-leaf-600' : 'bg-leaf-500')} style={{ width: `${phase.pct}%` }} />
                  </div>
                  {phase.lastOn && <p className="mt-1 text-sm text-loam-500">{t('time_entries.client.last_on', { date: formatShortDate(phase.lastOn) })}</p>}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="expenses" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="expenses" className="font-serif text-xl font-semibold text-prune-800">{t('time_entries.client.expenses_title')}</h2>
          {canWrite && <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />{t('time_entries.expenses.add_mine')}</Button>}
        </header>
        <p className="mt-1 text-sm text-loam-600">{tf('time_entries.client.expenses_intro')}</p>
        {expenses.length === 0 ? (
          <div className="mt-3"><EmptyState title={tf('time_entries.client.empty')} /></div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              {totals.amountCents > 0 && (
                <div>
                  <p className="text-sm text-loam-600">{t('time_entries.client.own_total')}</p>
                  <p className="font-serif text-3xl font-semibold leading-none tabular-nums text-prune-800">{t('time_entries.expenses.total', { amount: formatEuros(totals.amountCents, true) })}</p>
                  <p className="mt-1 text-sm text-loam-500">{formatEuros(totals.totalCents, true)} TVAC</p>
                </div>
              )}
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {byPayer.map((line) => (
                  <li key={line.paidBy} className="text-loam-700">
                    {payerLabel(line.paidBy, map.teamName, true)}{' '}
                    <span className="font-semibold tabular-nums text-loam-900">
                      {line.amountCents != null ? formatEuros(line.amountCents, true) : t('time_entries.client.lines', { count: line.count })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <ExpenseList mapId={map.id} expenses={expenses} catalog={expenseCatalog} today={today} teamName={map.teamName} client canWrite={canWrite} onChanged={reload} />
            </div>
          </>
        )}
      </section>

      <Dialog open={adding} onClose={() => setAdding(false)} title={t('time_entries.expenses.new_title_client')} dismissOnBackdrop={false}>
        {adding && (
          <ExpenseForm
            mapId={map.id} catalog={expenseCatalog} today={today} teamName={map.teamName} client
            onDone={() => { setAdding(false); reload() }}
            onCancel={() => setAdding(false)}
          />
        )}
      </Dialog>
    </div>
  )
}
