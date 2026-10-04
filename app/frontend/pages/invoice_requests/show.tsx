import { Head } from '@inertiajs/react'
import { CircleCheck, Receipt } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { content, tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { formatDate, formatMoney } from '@/lib/money'
import type { InvoiceRequestDetails } from '@/types/invoicing'

/** The request is sent: what Semisto received and what happens next. */
export default function InvoiceRequestShow({ invoiceRequest: request, userEmail }: { invoiceRequest: InvoiceRequestDetails; userEmail: string }) {
  const steps = content<string[]>('invoicing.new.next_steps')
  const fresh = request.status === 'requested'
  const rows: [string, string | null][] = [
    [t('invoicing.admin.plan'), `${t(`billing.plans.${request.planKey}.name`)}, ${t('invoicing.durations.year')}`],
    [t('invoicing.admin.amount'), tf('invoicing_mailer.details.amount_value', { amount: formatMoney(request.amountCents, request.currency) })],
    [t('invoicing.new.billing_address'), `${request.organizationName}\n${request.billingAddress}`],
    [t('invoicing.new.company_number'), request.companyNumber],
    [t('invoicing.new.billing_email'), request.billingEmail],
    [t('invoicing.new.purchase_order'), request.purchaseOrder],
    [t('invoicing.new.message'), request.message],
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={t(fresh ? 'invoicing.show.title' : 'invoicing.show.heading')} />
      {fresh ? (
        <div role="status" className="flex gap-3 rounded-xl bg-leaf-50 p-5 text-leaf-800 ring-1 ring-leaf-200">
          <CircleCheck className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-xl text-leaf-900">{t('invoicing.show.title')}</h1>
            <p className="mt-1">{tf('invoicing.show.lead', { organization: request.organizationName })}</p>
            <p className="mt-1 text-sm">{t('invoicing.show.email_note', { email: userEmail })}</p>
          </div>
        </div>
      ) : (
        <h1 className="text-2xl">{t('invoicing.show.heading')}</h1>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base">{t('invoicing.show.recap_title')}</h2>
          <span className="rounded-full bg-loam-100 px-2.5 py-1 text-xs font-medium text-loam-700">{t(`invoicing.statuses.${request.status}`)}</span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
          {rows.filter(([, value]) => value).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-loam-500">{label}</dt>
              <dd className="whitespace-pre-line text-loam-900">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-loam-400">{t('invoicing.billing.requested_on', { date: formatDate(request.createdAt) })}</p>
        {request.invoiceUrl && (
          <a href={request.invoiceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-prune-600 hover:text-prune-800">
            <Receipt className="h-4 w-4" aria-hidden="true" />{t('invoicing.show.open_invoice')}
          </a>
        )}
      </Card>

      {fresh && (
        <Card>
          <h2 className="text-base">{t('invoicing.new.next_title')}</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-loam-600">
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </Card>
      )}

      <ButtonLink href="/billing" variant="secondary">{t('invoicing.show.back')}</ButtonLink>
    </div>
  )
}
