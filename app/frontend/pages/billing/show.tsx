import { Head, Link, router, usePage } from '@inertiajs/react'
import { ArrowLeft, CircleCheck, HeartHandshake, Info, Landmark, Receipt } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CheckoutButton } from '@/components/billing/CheckoutButton'
import { IntervalToggle } from '@/components/billing/IntervalToggle'
import { PlanCard } from '@/components/billing/PlanCard'
import { PlacesOverview, PortalButton } from '@/components/billing/PlacesOverview'
import { HelpButton } from '@/components/help/HelpButton'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { formatDate, formatMoney, formatPrice } from '@/lib/money'
import type { SharedProps } from '@/types'
import type { BillingData, BillingInterval, CatalogKey, CatalogPlan, InvoiceRequestStatus, InvoiceRequestSummary } from '@/types/billing'

const PLAN_ORDER: CatalogKey[] = ['free', 'yearly', 'atelier', 'bureau']
// A pro account sees its plans first; nothing is hidden.
const PRO_PLAN_ORDER: CatalogKey[] = ['free', 'atelier', 'bureau', 'yearly']
const POLL_MS = 3000
const POLL_MAX = 8

export default function BillingShow({ billing }: { billing: BillingData }) {
  const { currentUser } = usePage().props as unknown as SharedProps
  const planOrder = currentUser?.accountKind === 'professional' ? PRO_PLAN_ORDER : PLAN_ORDER
  const catalog = (key: CatalogKey) => billing.catalog.find((plan) => plan.key === key) as CatalogPlan
  const confirmed = billing.plan !== 'free' || billing.payments.some((p) => Date.now() - Date.parse(p.paidAt) < 30 * 60_000) || billing.drone.length > 0
  const waiting = billing.checkout === 'success' && !confirmed
  const [interval, chooseInterval] = useState<BillingInterval>(billing.interval)

  // Back from Stripe before the confirmation reached us: look again for a short while.
  const polls = useRef(0)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => {
      if (++polls.current > POLL_MAX) return clearInterval(timer)
      router.reload({ only: ['billing'] })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [waiting])

  const highlighted = useRef<HTMLDivElement>(null)
  useEffect(() => { highlighted.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [])

  return (
    <div className="mx-auto max-w-5xl">
      <Head title={t('billing.title')} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl">{t('billing.title')}</h1>
          <p className="mt-1 text-loam-500">{t('billing.intro')}</p>
        </div>
        <HelpButton slug="formules-et-forfait" className="shrink-0" />
      </div>

      {!billing.checkout && billing.returnTo && (
        <ReturnLink href={billing.returnTo} className="mt-4" />
      )}

      {billing.checkout === 'success' && (
        <div role="status" className="mt-6 flex gap-3 rounded-xl bg-leaf-50 p-4 text-leaf-800 ring-1 ring-leaf-200">
          <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('billing.checkout.success_title')}</p>
            <p className="mt-0.5 text-sm">{waiting ? t('billing.checkout.success_waiting') : t('billing.checkout.success_body')}</p>
            {billing.returnTo && !waiting && <ReturnLink href={billing.returnTo} className="mt-3" />}
          </div>
        </div>
      )}
      {billing.checkout === 'cancelled' && (
        <div role="status" className="mt-6 flex gap-3 rounded-xl bg-white p-4 text-loam-700 ring-1 ring-loam-200">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-loam-400" aria-hidden="true" />
          <div>
            <p className="text-sm">{t('billing.checkout.cancelled')}</p>
            {billing.returnTo && <ReturnLink href={billing.returnTo} className="mt-2" />}
          </div>
        </div>
      )}

      <PlacesOverview billing={billing} />

      <div className="mt-12 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg">{t('billing.plans_title')}</h2>
        <IntervalToggle value={interval} onChange={chooseInterval} />
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {planOrder.map((key) => (
          <div key={key} ref={billing.highlight === key ? highlighted : undefined} className="flex">
            <PlanCard
              plan={catalog(key)}
              interval={interval}
              className="w-full"
              highlighted={billing.highlight === key}
              current={billing.plan === key}
              action={<PlanAction billing={billing} plan={catalog(key)} interval={interval} />}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div ref={billing.highlight === 'drone' ? highlighted : undefined}>
            <h3 className="text-base">{t('billing.plans.drone.name')}</h3>
            <p className="mt-1 text-sm text-loam-500">{t('billing.plans.drone.tagline')}</p>
            <p className="mt-2 text-sm text-loam-700">{formatPrice(catalog('drone').priceCents)} · {t('billing.plans.drone.price_note')}</p>
          </div>
          {billing.enabled && catalog('drone').purchasable ? (
            <CheckoutButton plan="drone" variant="secondary" className="shrink-0" returnTo={billing.returnTo}>{t('billing.actions.buy_drone')}</CheckoutButton>
          ) : (
            <Button variant="secondary" disabled className="shrink-0">{t('billing.actions.unavailable')}</Button>
          )}
        </Card>
        <Card className="bg-leaf-50/60">
          <h3 className="text-base">{t('billing.member.title')}</h3>
          <p className={billing.member ? 'mt-1 text-sm font-medium text-leaf-800' : 'mt-1 text-sm text-loam-600'}>
            {tf(billing.member ? 'billing.member.recognised' : 'billing.member.body', { price: formatPrice(billing.memberPriceCents), full: formatPrice(catalog('yearly').priceCents) })}
          </p>
        </Card>
      </div>

      <InvoiceCard requests={billing.invoiceRequests} />

      <p className="mt-4 text-sm text-loam-400">{t('billing.actions.pay_securely')}</p>

      {billing.drone.length > 0 && (
        <Card className="mt-8">
          <h2 className="text-base">{t('billing.drone.title')}</h2>
          <ul className="mt-3 space-y-1 text-sm text-loam-600">
            {billing.drone.map((order) => (
              <li key={order.paidAt}>{t('billing.drone.body', { date: formatDate(order.paidAt) })}</li>
            ))}
          </ul>
        </Card>
      )}

      {billing.enabled && (
        <section className="mt-12" aria-labelledby="payments-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="payments-title" className="text-lg">{t('billing.payments.title')}</h2>
            {billing.canManage && <PortalButton label={t('billing.actions.invoices')} />}
          </div>
          <p className="mt-2 flex max-w-2xl gap-2 text-sm text-loam-600">
            <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
            {t('billing.supports')}
          </p>
          {billing.payments.length === 0 ? (
            <p className="mt-4 text-sm text-loam-500">{t('billing.payments.empty')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-loam-200 rounded-xl bg-white ring-1 ring-loam-200/70">
              {billing.payments.map((payment) => (
                <li key={payment.id} className="px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-loam-900">{t(`billing.payments.kind.${payment.planKey}`)}</span>
                  <span className="tabular-nums text-loam-900">{formatMoney(payment.amountCents, payment.currency)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-loam-500">
                  <span>{formatDate(payment.paidAt)}</span>
                  {payment.refundedCents > 0 && (
                    <span className="text-clay-700">{t('billing.payments.refunded', { amount: formatMoney(payment.refundedCents, payment.currency) })}</span>
                  )}
                  {payment.invoiceUrl && (
                    <a href={payment.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-prune-600 hover:text-prune-800">
                      <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('billing.payments.invoice')}
                    </a>
                  )}
                </div>
              </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

/** The button of a plan card: buy, renew, manage in the portal, or "your current plan". */
function PlanAction({ billing, plan, interval }: { billing: BillingData; plan: CatalogPlan; interval: BillingInterval }) {
  const subscribed = billing.subscription?.active ? billing.subscription : null
  if (plan.key === 'free') {
    return billing.enabled && billing.plan === 'free' ? <p className="text-center text-sm font-medium text-leaf-700">{t('billing.actions.current')}</p> : null
  }
  if (plan.kind === 'subscription' && subscribed) {
    if (subscribed.planKey === plan.key) {
      return (
        <div className="space-y-2">
          <p className="text-center text-sm font-medium text-leaf-700">{t('billing.actions.current')}</p>
          <PortalButton label={t('billing.actions.manage')} />
        </div>
      )
    }
    return <PortalButton label={t('billing.actions.manage')} />
  }
  const yearly = plan.kind === 'subscription' && interval === 'year'
  if (!billing.enabled || !(yearly ? plan.yearlyPurchasable : plan.purchasable)) {
    return <Button variant="secondary" disabled className="w-full">{t('billing.actions.unavailable')}</Button>
  }
  const renewing = plan.key === 'yearly' && Boolean(billing.pass || billing.expiredPass)
  return (
    <CheckoutButton plan={plan.key} interval={plan.kind === 'subscription' ? interval : undefined} returnTo={billing.returnTo} variant={plan.key === 'yearly' ? 'primary' : 'secondary'} className="w-full">
      {renewing ? t('billing.actions.renew') : t('billing.actions.choose')}
    </CheckoutButton>
  )
}

const REQUEST_STATUS_STYLES: Record<InvoiceRequestStatus, string> = {
  requested: 'bg-prune-50 text-prune-700',
  invoiced: 'bg-humus-50 text-humus-700',
  paid: 'bg-leaf-50 text-leaf-700',
  cancelled: 'bg-loam-100 text-loam-600',
}

/** « Payer sur facture »: the way in for communes, schools and companies, and their requests. */
function InvoiceCard({ requests }: { requests: InvoiceRequestSummary[] }) {
  return (
    <Card className="mt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" aria-hidden="true" />
          <div>
            <h3 className="text-base">{t('invoicing.entry.title')}</h3>
            <p className="mt-1 text-sm text-loam-500">{tf('invoicing.entry.body')}</p>
          </div>
        </div>
        <ButtonLink href="/billing/invoice" variant="secondary" className="shrink-0">{t('invoicing.entry.cta')}</ButtonLink>
      </div>
      {requests.length > 0 && (
        <div className="mt-4 border-t border-loam-100 pt-4">
          <h4 className="text-sm font-semibold text-loam-800">{t('invoicing.billing.requests_title')}</h4>
          <ul className="mt-1 divide-y divide-loam-100 text-sm">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <div className="min-w-0">
                  <Link href={`/billing/invoice/${request.id}`} className="break-words font-medium text-loam-900 hover:text-prune-700">
                    {t('invoicing.billing.request_line', { plan: t(`billing.plans.${request.planKey}.name`), organization: request.organizationName })}
                  </Link>
                  <p className="text-xs text-loam-500">{t('invoicing.billing.requested_on', { date: formatDate(request.createdAt) })} · {formatMoney(request.amountCents, request.currency)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {request.invoiceUrl && (
                    <a href={request.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-prune-600 hover:text-prune-800">
                      <Receipt className="h-3.5 w-3.5" aria-hidden="true" />{t('invoicing.billing.open_invoice')}
                    </a>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REQUEST_STATUS_STYLES[request.status]}`}>{t(`invoicing.statuses.${request.status}`)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

/** Back to where the person left (a locked panel, a read-only map). */
function ReturnLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 text-sm font-semibold text-prune-700 underline underline-offset-2 hover:text-prune-800 ${className ?? ''}`}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t('billing.return')}
    </Link>
  )
}
