import { Head, Link, router, usePage } from '@inertiajs/react'
import { ChevronLeft, ChevronRight, FileText, Receipt } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { confirmAction } from '@/components/ui/confirm'
import { toast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { HelpButton } from '@/components/help/HelpButton'
import { tf } from '@/lib/content'
import { formatNumber, t } from '@/lib/i18n'
import { EntryForm } from '@/time_entries/EntryForm'
import { EntryList } from '@/time_entries/EntryList'
import { formatDate, formatDuration, formatMonth, statementHref } from '@/time_entries/format'
import type { Catalog, ProjectChoice, TimeEntry } from '@/time_entries/types'
import type { CurrentUser } from '@/types'

type ToInvoice = { billTo: string | null; minutes: number; km: number; entries: number; projects: number; from: string; to: string }
type Invoiced = { billTo: string | null; invoiceNumber: string | null; invoicedAt: string; minutes: number; entries: number }
type Props = {
  month: string
  today: string
  entries: TimeEntry[]
  monthTotals: { minutes: number; billableMinutes: number; km: number }
  toInvoice: ToInvoice[]
  invoiced: Invoiced[]
  maps: ProjectChoice[]
  billToSuggestions: string[]
  catalog: Catalog
}

const shiftMonth = (month: string, by: number) => {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1 + by, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * « Mes heures »: the time I spent on each project, and what I still have
 * to invoice, recipient by recipient, ready to become a « relevé de
 * prestations » to attach to my invoice.
 */
export default function MyHours({ month, today, entries, monthTotals, toInvoice, invoiced, maps, billToSuggestions, catalog }: Props) {
  const { currentUser } = usePage().props as unknown as { currentUser: CurrentUser }
  const reload = () => router.reload({ only: ['entries', 'monthTotals', 'toInvoice', 'invoiced', 'maps', 'billToSuggestions'] })
  const thisMonth = today.slice(0, 7)

  async function reopen(invoice: Invoiced) {
    const number = invoice.invoiceNumber ?? '—'
    const ok = await confirmAction({ title: t('time_entries.mine.reopen_title', { number }), body: t('time_entries.mine.reopen_body'), confirmLabel: t('time_entries.mine.reopen') })
    if (!ok) return
    try {
      const params = new URLSearchParams()
      if (invoice.billTo) params.set('bill_to', invoice.billTo)
      if (invoice.invoiceNumber) params.set('invoice_number', invoice.invoiceNumber)
      await api(`/time_entries/statement?${params.toString()}`, { method: 'DELETE' })
      toast(t('time_entries.mine.reopened'), { tone: 'success' })
      reload()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('time_entries.errors.generic'), { tone: 'error' })
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Head title={t('time_entries.mine.page_title')} />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl">{t('time_entries.mine.title')}</h1>
        <HelpButton slug="suivre-son-temps-et-ses-kilometres" />
      </div>
      <p className="mt-1 text-loam-600">{tf('time_entries.mine.intro')}</p>

      {maps.length === 0 && entries.length === 0 && toInvoice.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={tf('time_entries.mine.no_projects_title')} action={<ButtonLink href="/maps" variant="secondary">{t('time_entries.mine.to_maps')}</ButtonLink>}>
            {tf('time_entries.mine.no_projects')}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <section aria-labelledby="to-invoice" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
            <h2 id="to-invoice" className="flex items-center gap-2 font-serif text-xl font-semibold text-prune-800"><Receipt className="h-5 w-5" aria-hidden />{t('time_entries.mine.to_invoice_title')}</h2>
            {toInvoice.length === 0 ? (
              <p className="mt-2 text-sm text-loam-600">{tf('time_entries.mine.to_invoice_empty')}</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {toInvoice.map((line) => (
                  <li key={line.billTo ?? '—'} className="flex flex-col justify-between gap-3 rounded-xl bg-loam-50 p-4 ring-1 ring-loam-900/10">
                    <div>
                      <p className="font-semibold text-loam-900">{line.billTo ?? t('time_entries.mine.no_recipient')}</p>
                      <p className="mt-1 text-sm text-loam-700">
                        {t('time_entries.mine.to_invoice_line', { duration: formatDuration(line.minutes), km: formatNumber(line.km), projects: t('time_entries.mine.to_invoice_projects', { count: line.projects }) })}
                      </p>
                      <p className="text-sm text-loam-500">{t('time_entries.mine.since', { from: formatDate(line.from), to: formatDate(line.to) })}</p>
                    </div>
                    <ButtonLink href={statementHref(line.billTo)} size="sm" className="self-start"><FileText className="h-4 w-4" aria-hidden />{t('time_entries.mine.prepare')}</ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {maps.length > 0 && (
            <section aria-labelledby="note-time" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
              <h2 id="note-time" className="font-serif text-xl font-semibold text-prune-800">{t('time_entries.form.title')}</h2>
              <div className="mt-3">
                <EntryForm projects={maps} catalog={catalog} billToSuggestions={billToSuggestions} today={today} onDone={reload} />
              </div>
            </section>
          )}

          <section aria-labelledby="my-month" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="my-month" className="font-serif text-xl font-semibold capitalize text-prune-800">{formatMonth(month)}</h2>
              <nav className="flex items-center gap-1" aria-label={t('time_entries.mine.month_title')}>
                <Link href={`/time_entries?month=${shiftMonth(month, -1)}`} preserveScroll className="inline-flex h-8 w-8 items-center justify-center rounded-full text-loam-600 hover:bg-loam-100" aria-label={t('time_entries.mine.previous_month')}><ChevronLeft className="h-4 w-4" /></Link>
                {month < thisMonth && <Link href={`/time_entries?month=${shiftMonth(month, 1)}`} preserveScroll className="inline-flex h-8 w-8 items-center justify-center rounded-full text-loam-600 hover:bg-loam-100" aria-label={t('time_entries.mine.next_month')}><ChevronRight className="h-4 w-4" /></Link>}
              </nav>
            </header>
            {entries.length === 0 ? (
              <p className="mt-2 text-sm text-loam-600">{t('time_entries.mine.empty_month')}</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-loam-600">
                  {t('time_entries.mine.month_totals', { duration: formatDuration(monthTotals.minutes), billable: formatDuration(monthTotals.billableMinutes), km: formatNumber(monthTotals.km) })}
                </p>
                <div className="mt-2">
                  <EntryList entries={entries} userId={currentUser.id} show="project" projects={maps} catalog={catalog} billToSuggestions={billToSuggestions} today={today} onChanged={reload} />
                </div>
              </>
            )}
          </section>

          {invoiced.length > 0 && (
            <section aria-labelledby="invoiced" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
              <h2 id="invoiced" className="font-serif text-xl font-semibold text-prune-800">{t('time_entries.mine.invoiced_title')}</h2>
              <ul className="mt-2 divide-y divide-loam-900/5">
                {invoiced.map((invoice) => (
                  <li key={`${invoice.billTo}-${invoice.invoiceNumber}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-loam-900">{invoice.billTo ?? t('time_entries.mine.no_recipient')}</p>
                      <p className="text-loam-500">{t('time_entries.mine.invoiced_line', { number: invoice.invoiceNumber ?? '—', duration: formatDuration(invoice.minutes), date: formatDate(invoice.invoicedAt) })}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => void reopen(invoice)}>{t('time_entries.mine.reopen')}</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
