import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, FileText, Info, Mail, Receipt } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { formatDate, formatMoney } from '@/lib/money'
import { relativeTime } from '@/lib/relativeTime'
import type { InvoiceRequestStatus } from '@/types/billing'
import type { AdminInvoiceRequest } from '@/types/invoicing'

type Filter = 'open' | 'paid' | 'cancelled' | 'all'
type Props = {
  requests: AdminInvoiceRequest[]
  counts: Record<Filter, number>
  filters: { status: Filter }
  stripeEnabled: boolean
}

const FILTERS: Filter[] = ['open', 'paid', 'cancelled', 'all']

const STATUS_STYLES: Record<InvoiceRequestStatus, string> = {
  requested: 'bg-prune-100 text-prune-700',
  invoiced: 'bg-humus-100 text-humus-700',
  paid: 'bg-leaf-100 text-leaf-700',
  cancelled: 'bg-loam-100 text-loam-600',
}

/** Semisto staff: invoice requests from communes, schools and companies. */
export default function AdminInvoiceRequests({ requests, counts, filters, stripeEnabled }: Props) {
  return (
    <div>
      <Head title={t('invoicing.admin.title')} />
      <Link href="/admin/requests" className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-800">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('invoicing.admin.back')}
      </Link>
      <h1 className="mt-3 text-2xl">{t('invoicing.admin.title')}</h1>
      <p className="mt-1 max-w-3xl text-loam-500">{tf('invoicing.admin.intro')}</p>
      <p className="mt-4 flex max-w-3xl gap-2 rounded-lg bg-white p-3 text-sm text-loam-600 ring-1 ring-loam-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-loam-400" aria-hidden />
        {tf(stripeEnabled ? 'invoicing.admin.stripe_note' : 'invoicing.admin.manual_note')}
      </p>

      <div className="mt-6 flex flex-wrap gap-1.5" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f} type="button" role="tab" aria-selected={filters.status === f}
            onClick={() => router.get('/admin/invoice-requests', { status: f }, { preserveScroll: true, preserveState: true })}
            className={clsx(
              'rounded-full px-3 py-1.5 text-sm transition-colors',
              filters.status === f ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50',
            )}
          >
            {t(`invoicing.admin.filters.${f}`)} <span className={filters.status === f ? 'text-prune-200' : 'text-loam-500'}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="mt-6"><EmptyState title={t('invoicing.admin.empty')} /></div>
      ) : (
        <ul className="mt-6 space-y-4">
          {requests.map((request) => <li key={request.id}><RequestCard request={request} stripeEnabled={stripeEnabled} /></li>)}
        </ul>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-loam-500">{label}</dt>
      <dd className="whitespace-pre-line break-words text-loam-800">{children}</dd>
    </div>
  )
}

function RequestCard({ request, stripeEnabled }: { request: AdminInvoiceRequest; stripeEnabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [startsOn, setStartsOn] = useState(request.suggestedStart ?? '')
  const amount = formatMoney(request.amountCents, request.currency)
  const open = request.status === 'requested' || request.status === 'invoiced'
  const throughStripe = stripeEnabled && request.status === 'invoiced' && Boolean(request.stripeInvoiceId)
  const plan = t(`billing.plans.${request.planKey}.name`)

  function act(action: string, confirmText: string | null, data: Record<string, string> = {}) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    router.post(`/admin/invoice-requests/${request.id}/${action}`, data, { preserveScroll: true, onFinish: () => setBusy(false) })
  }

  return (
    <Card className="p-0!">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-loam-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="break-words text-base">{request.organizationName}</h2>
          <p className="text-sm text-loam-500">
            {plan} · {tf('invoicing.admin.amount_value', { amount, months: request.durationMonths })} · {t('invoicing.admin.received', { when: relativeTime(request.createdAt) })}
          </p>
        </div>
        <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', STATUS_STYLES[request.status])}>
          {t(`invoicing.statuses.${request.status}`)}
        </span>
      </div>

      <div className="grid gap-6 px-5 py-4 lg:grid-cols-2">
        <dl className="space-y-3 text-sm">
          <Row label={t('invoicing.admin.from')}>
            {request.user.name} · <a href={`mailto:${request.user.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3.5 w-3.5" aria-hidden />{request.user.email}</a>
          </Row>
          <Row label={t('invoicing.admin.billing_email')}>{request.billingEmail}</Row>
          <Row label={t('invoicing.admin.address')}>
            {request.billingAddress}
            {stripeEnabled && <span className="mt-1 block text-xs text-loam-500">{t('invoicing.admin.stripe_address', { address: request.stripeAddress })}</span>}
          </Row>
          {request.companyNumber && (
            <Row label={t('invoicing.admin.company_number')}>
              {request.companyNumber}
              {request.euVat && <span className="ml-2 rounded bg-leaf-50 px-1.5 py-0.5 text-xs text-leaf-700">{t('invoicing.admin.eu_vat')}</span>}
            </Row>
          )}
          {request.purchaseOrder && <Row label={t('invoicing.admin.purchase_order')}>{request.purchaseOrder}</Row>}
          {request.message && <Row label={t('invoicing.admin.message')}>{request.message}</Row>}
        </dl>

        <div className="space-y-4 text-sm lg:border-l lg:border-loam-100 lg:pl-6">
          <div className="space-y-1.5">
            {request.stripeInvoiceId && request.status !== 'requested' && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-loam-800">
                  {request.invoiceNumber ? t('invoicing.admin.invoice_number', { number: request.invoiceNumber }) : t('invoicing.admin.invoice')}
                </span>
                {request.invoiceUrl && (
                  <a href={request.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-prune-600 hover:text-prune-800">
                    <Receipt className="h-3.5 w-3.5" aria-hidden />{t('invoicing.admin.open_invoice')}
                  </a>
                )}
                {request.invoicePdfUrl && (
                  <a href={request.invoicePdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-prune-600 hover:text-prune-800">
                    <FileText className="h-3.5 w-3.5" aria-hidden />{t('invoicing.admin.invoice_pdf')}
                  </a>
                )}
              </p>
            )}
            {request.paidAt && <p className="text-leaf-700">{t('invoicing.admin.paid_on', { date: formatDate(request.paidAt) })}</p>}
            <p className={request.grant && !request.grant.revokedAt ? 'text-leaf-700' : 'text-loam-500'}>
              {request.grant
                ? request.grant.revokedAt
                  ? t('invoicing.admin.grant_revoked', { date: formatDate(request.grant.revokedAt) })
                  : t('invoicing.admin.grant_active', { start: formatDate(request.grant.startsAt), end: formatDate(request.grant.endsAt) })
                : t('invoicing.admin.grant_none')}
            </p>
            {request.handledBy && <p className="text-xs text-loam-500">{t('invoicing.admin.handled_by', { name: request.handledBy })}</p>}
          </div>

          {open && (
            <div className="space-y-3 border-t border-loam-100 pt-4">
              {stripeEnabled && request.status === 'requested' && (
                <Button
                  disabled={busy} className="w-full sm:w-auto"
                  onClick={() => act('invoice', t('invoicing.admin.confirm.create_invoice', { amount, email: request.billingEmail }))}
                >
                  {busy ? t('invoicing.admin.actions.working') : t('invoicing.admin.actions.create_invoice')}
                </Button>
              )}
              {!request.grant && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block space-y-1">
                    <span className="block text-xs text-loam-500">{t('invoicing.admin.starts_on')}</span>
                    <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="w-auto!" />
                  </label>
                  <Button variant="leaf" disabled={busy} onClick={() => act('activate', null, startsOn ? { starts_on: startsOn } : {})}>
                    {t('invoicing.admin.actions.activate')}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary" disabled={busy}
                  onClick={() => act('mark-paid', t(throughStripe ? 'invoicing.admin.confirm.mark_paid_stripe' : 'invoicing.admin.confirm.mark_paid'))}
                >
                  {t('invoicing.admin.actions.mark_paid')}
                </Button>
                <Button
                  variant="ghost" disabled={busy} className="text-clay-700"
                  onClick={() => act('cancel', t(throughStripe ? 'invoicing.admin.confirm.cancel_stripe' : 'invoicing.admin.confirm.cancel'))}
                >
                  {t('invoicing.admin.actions.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
