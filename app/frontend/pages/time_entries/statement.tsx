import { Head, Link, router } from '@inertiajs/react'
import { ArrowLeft, Printer } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { formatDate, formatDuration, statementHref } from '@/time_entries/format'
import type { Phase, TimeEntry } from '@/time_entries/types'

type Project = {
  mapId: number
  name: string
  client: string | null
  offer: string | null
  minutes: number
  km: number
  phases: { phase: Phase; minutes: number }[]
  entries: TimeEntry[]
}
type Statement = {
  designer: { name: string; email: string }
  billTo: string | null
  period: { from: string | null; to: string | null }
  projects: Project[]
  trips: TimeEntry[]
  totals: { minutes: number; km: number; entries: number }
  nonBillable: TimeEntry[]
  generatedOn: string
}
type Props = { statement: Statement; filters: { billTo: string | null; from: string | null; to: string | null } }

/**
 * « Relevé de prestations »: an A4 sheet listing, project by project, the
 * hours and trips to put on one invoice. The browser prints it or saves it
 * as PDF; then « Marquer comme facturé » locks what it lists.
 */
export default function TimeStatement({ statement, filters }: Props) {
  const [from, setFrom] = useState(filters.from ?? '')
  const [to, setTo] = useState(filters.to ?? '')
  const [number, setNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const empty = statement.totals.entries === 0

  function applyPeriod(event: FormEvent) {
    event.preventDefault()
    router.visit(statementHref(filters.billTo, from || null, to || null), { preserveScroll: true })
  }

  async function markInvoiced(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await api<{ invoiced: number }>('/time_entries/statement', {
        method: 'POST', body: { bill_to: filters.billTo, from: filters.from, to: filters.to, invoice_number: number },
      })
      toast(t('time_entries.statement.marked', { count: result.invoiced }), { tone: 'success' })
      router.visit('/time_entries')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[210mm]">
      <Head title={t('time_entries.statement.page_title')} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/time_entries" className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />{t('time_entries.statement.back')}</Link>
        <Button onClick={() => window.print()} disabled={empty}>
          <Printer className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t('time_entries.statement.print')}</span>
          <span className="sm:hidden">{t('time_entries.statement.print_short')}</span>
        </Button>
      </div>

      <form onSubmit={applyPeriod} className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 print:hidden">
        <Field label={t('time_entries.statement.from')}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('time_entries.statement.to')}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Button type="submit" variant="secondary">{t('time_entries.statement.apply')}</Button>
      </form>

      <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-900/10 sm:p-10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-loam-900/10 pb-4">
          <div>
            <h1 className="text-3xl">{t('time_entries.statement.title')}</h1>
            <p className="mt-1 text-sm text-loam-500">{t('time_entries.statement.not_fiscal')}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-loam-500">{t('time_entries.statement.designer')}</dt>
            <dd className="font-medium">{statement.designer.name}<span className="block font-normal text-loam-600">{statement.designer.email}</span></dd>
            <dt className="text-loam-500">{t('time_entries.statement.bill_to')}</dt>
            <dd className="font-medium">{statement.billTo ?? '—'}</dd>
            {statement.period.from && statement.period.to && (
              <>
                <dt className="text-loam-500">{t('time_entries.statement.period')}</dt>
                <dd>{t('time_entries.statement.period_value', { from: formatDate(statement.period.from), to: formatDate(statement.period.to) })}</dd>
              </>
            )}
          </dl>
        </header>

        {empty ? (
          <p className="py-8 text-center text-loam-600">{t('time_entries.statement.empty')}</p>
        ) : (
          <>
            {statement.projects.map((project) => (
              <section key={project.mapId} className="mt-6 break-inside-avoid-page">
                <h2 className="font-serif text-xl font-semibold text-prune-800">
                  {project.name}
                  {(project.client || project.offer) && (
                    <span className="ml-2 font-sans text-sm font-normal text-loam-500">
                      {[project.client, project.offer && t('time_entries.statement.offer', { version: project.offer })].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </h2>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-loam-900/10 text-left text-loam-500">
                      <th scope="col" className="py-1.5 pr-2 font-medium">{t('time_entries.statement.date')}</th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">{t('time_entries.statement.phase')}</th>
                      <th scope="col" className="py-1.5 pr-2 font-medium">{t('time_entries.statement.what')}</th>
                      <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t('time_entries.statement.hours')}</th>
                      <th scope="col" className="py-1.5 text-right font-medium">{t('time_entries.statement.km')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-loam-900/5">
                    {project.entries.map((entry) => (
                      <tr key={entry.id} className="align-top">
                        <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">{formatDate(entry.workedOn)}</td>
                        <td className="whitespace-nowrap py-1.5 pr-2">{t(`time_entries.phases.${entry.phase}`)}</td>
                        <td className="py-1.5 pr-2 text-loam-700">{entry.note}</td>
                        <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{formatDuration(entry.minutes)}</td>
                        <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{entry.tripKm != null ? formatNumber(entry.tripKm) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-loam-900/20 font-semibold">
                      <td colSpan={3} className="py-1.5 pr-2">
                        {t('time_entries.statement.project_total')}
                        <span className="ml-2 font-normal text-loam-500">{project.phases.map((p) => `${t(`time_entries.phases.${p.phase}`)} ${formatDuration(p.minutes)}`).join(' · ')}</span>
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{formatDuration(project.minutes)}</td>
                      <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{project.km ? formatNumber(project.km) : ''}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            ))}

            <p className="mt-6 flex justify-between border-t-2 border-loam-900/30 pt-2 text-base font-semibold">
              <span>{t('time_entries.statement.total')}</span>
              <span className="tabular-nums">{formatDuration(statement.totals.minutes)}{statement.totals.km ? ` · ${formatNumber(statement.totals.km)} km` : ''}</span>
            </p>

            {statement.trips.length > 0 && (
              <section className="mt-6 break-inside-avoid-page">
                <h2 className="font-serif text-lg font-semibold text-prune-800">{t('time_entries.statement.trips_title')}</h2>
                <ul className="mt-1 text-sm">
                  {statement.trips.map((trip) => (
                    <li key={trip.id} className="flex justify-between gap-3 py-0.5">
                      <span>{formatDate(trip.workedOn)} · {trip.mapName ?? statement.projects.find((p) => p.mapId === trip.mapId)?.name}{trip.tripFrom || trip.tripTo ? ` · ${t('time_entries.statement.trip_route', { from: trip.tripFrom ?? '…', to: trip.tripTo ?? '…' })}` : ''}</span>
                      <span className="tabular-nums">{formatNumber(trip.tripKm ?? 0)} km</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {statement.nonBillable.length > 0 && (
              <section className="mt-6 break-inside-avoid-page text-sm text-loam-600">
                <h2 className="font-serif text-lg font-semibold text-loam-700">{t('time_entries.statement.non_billable_title')}</h2>
                <ul className="mt-1">
                  {statement.nonBillable.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-3 py-0.5">
                      <span>{formatDate(entry.workedOn)} · {statement.projects.find((p) => p.mapId === entry.mapId)?.name ?? ''} · {t(`time_entries.reasons.${entry.nonBillableReason ?? 'other'}`)}{entry.note ? ` · ${entry.note}` : ''}</span>
                      <span className="tabular-nums">{formatDuration(entry.minutes)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <p className="mt-8 text-sm text-loam-500">{t('time_entries.statement.generated_on', { date: formatDate(statement.generatedOn) })}</p>
      </article>

      {!empty && (
        <form onSubmit={markInvoiced} className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 print:hidden">
          <h2 className="font-serif text-lg font-semibold text-prune-800">{t('time_entries.statement.mark_title')}</h2>
          <p className="mt-1 text-sm text-loam-600">{t('time_entries.statement.mark_body')}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label={t('time_entries.statement.invoice_number')}><Input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={60} required /></Field>
            <Button type="submit" variant="leaf" disabled={saving || !number.trim()}>{t('time_entries.statement.mark')}</Button>
          </div>
        </form>
      )}
    </div>
  )
}
