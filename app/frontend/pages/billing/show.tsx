import { Head, router } from '@inertiajs/react'
import { CircleCheck, FlaskConical, Info, Receipt } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CheckoutButton } from '@/components/billing/CheckoutButton'
import { PlanCard } from '@/components/billing/PlanCard'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { formatDate, formatMoney, formatPrice } from '@/lib/money'
import type { BillingData, CatalogKey, CatalogPlan } from '@/types/billing'

const PLAN_ORDER: CatalogKey[] = ['free', 'yearly', 'atelier', 'bureau']
const POLL_MS = 3000
const POLL_MAX = 8

export default function BillingShow({ billing }: { billing: BillingData }) {
  const catalog = (key: CatalogKey) => billing.catalog.find((plan) => plan.key === key) as CatalogPlan
  const confirmed = billing.plan !== 'free' || billing.payments.some((p) => Date.now() - Date.parse(p.paidAt) < 30 * 60_000) || billing.drone.length > 0
  const waiting = billing.checkout === 'success' && !confirmed

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

      {billing.checkout === 'success' && (
        <div role="status" className="mt-6 flex gap-3 rounded-xl bg-leaf-50 p-4 text-leaf-800 ring-1 ring-leaf-200">
          <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('billing.checkout.success_title')}</p>
            <p className="mt-0.5 text-sm">{waiting ? t('billing.checkout.success_waiting') : t('billing.checkout.success_body')}</p>
          </div>
        </div>
      )}
      {billing.checkout === 'cancelled' && (
        <div role="status" className="mt-6 flex gap-3 rounded-xl bg-white p-4 text-loam-700 ring-1 ring-loam-200">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-loam-400" aria-hidden="true" />
          <p className="text-sm">{t('billing.checkout.cancelled')}</p>
        </div>
      )}

      {!billing.enabled && (
        <div className="mt-6 flex gap-3 rounded-xl bg-humus-50 p-5 text-humus-700 ring-1 ring-humus-200">
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('billing.status.beta_title')}</p>
            <p className="mt-1 text-sm">{t('billing.status.beta_body')}</p>
          </div>
        </div>
      )}
      {billing.enabled && <StatusCard billing={billing} />}

      <h2 className="mt-12 text-lg">{t('billing.plans_title')}</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((key) => (
          <div key={key} ref={billing.highlight === key ? highlighted : undefined} className="flex">
            <PlanCard
              plan={catalog(key)}
              className="w-full"
              highlighted={billing.highlight === key}
              current={billing.plan === key}
              action={<PlanAction billing={billing} plan={catalog(key)} />}
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
            <CheckoutButton plan="drone" variant="secondary" className="shrink-0">{t('billing.actions.buy_drone')}</CheckoutButton>
          ) : (
            <Button variant="secondary" disabled className="shrink-0">{t('billing.actions.unavailable')}</Button>
          )}
        </Card>
        <Card className="bg-leaf-50/60">
          <h3 className="text-base">{t('billing.member.title')}</h3>
          <p className="mt-1 text-sm text-loam-600">
            {tf('billing.member.body', { price: formatPrice(billing.memberPriceCents), full: formatPrice(catalog('yearly').priceCents) })}
          </p>
        </Card>
      </div>

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

function PortalButton({ label, variant = 'secondary' }: { label: string; variant?: 'primary' | 'secondary' }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={variant}
      disabled={busy}
      onClick={() => {
        setBusy(true)
        router.post('/billing/portal', {}, { onFinish: () => setBusy(false) })
      }}
    >
      {busy ? t('billing.actions.redirecting') : label}
    </Button>
  )
}

/** The button of a plan card: buy, renew, manage in the portal, or "your current plan". */
function PlanAction({ billing, plan }: { billing: BillingData; plan: CatalogPlan }) {
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
  if (!billing.enabled || !plan.purchasable) return <Button variant="secondary" disabled className="w-full">{t('billing.actions.unavailable')}</Button>
  const renewing = plan.key === 'yearly' && Boolean(billing.pass || billing.expiredPass)
  return (
    <CheckoutButton plan={plan.key} variant={plan.key === 'yearly' ? 'primary' : 'secondary'} className="w-full">
      {renewing ? t('billing.actions.renew') : t('billing.actions.choose')}
    </CheckoutButton>
  )
}

/** Where the user stands: plan, expiry, maps used, and what happens next. */
function StatusCard({ billing }: { billing: BillingData }) {
  const { plan, pass, expiredPass, subscription } = billing
  const maps = Number.isFinite(billing.maxMaps) && billing.maxMaps < 1000
    ? t('billing.status.maps_used', { used: billing.ownedMaps, max: billing.maxMaps })
    : t('billing.status.maps_used_unlimited', { used: billing.ownedMaps })
  const expired = plan === 'free' && expiredPass

  let title = t('billing.status.free_title')
  if (plan === 'yearly') title = t('billing.status.yearly_title')
  else if (plan === 'atelier' || plan === 'bureau') title = t(`billing.plans.${plan}.name`)
  else if (expired) title = t('billing.status.expired_title')

  return (
    <Card className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-leaf-600">{t('billing.status.current')}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-xl">{title}</h2>
          <div className="mt-2 space-y-1.5 text-sm text-loam-600">
            {plan === 'free' && !expired && <p>{t('billing.status.free_body')}</p>}
            {expired && (
              <>
                <p>{t('billing.status.expired_on', { date: formatDate(expiredPass.expiresAt) })} {t('billing.status.expired_body')}</p>
                {billing.readOnlyMaps > 0 && <p className="font-medium text-humus-700">{t('billing.status.read_only_maps', { count: billing.readOnlyMaps })}</p>}
              </>
            )}
            {pass && plan === 'yearly' && (
              <>
                <p className="font-medium text-loam-800">{t('billing.status.yearly_until', { date: formatDate(pass.expiresAt) })}</p>
                <p>{t('billing.status.yearly_days', { count: pass.daysLeft })}</p>
                <p className="text-loam-500">{t('billing.status.yearly_renew_note')}</p>
              </>
            )}
            {subscription && (
              <>
                {subscription.active && subscription.currentPeriodEnd && !subscription.cancelAtPeriodEnd && (
                  <p>{t('billing.status.subscription_next', { date: formatDate(subscription.currentPeriodEnd) })}</p>
                )}
                {subscription.active && subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                  <p className="font-medium text-humus-700">{t('billing.status.subscription_canceling', { date: formatDate(subscription.currentPeriodEnd) })}</p>
                )}
                {subscription.pastDue && <p className="font-medium text-clay-700">{t('billing.status.subscription_past_due')}</p>}
                {!subscription.active && !subscription.pastDue && <p>{t('billing.status.subscription_ended')}</p>}
              </>
            )}
            <p className="text-loam-500">{maps}</p>
          </div>
        </div>
        {billing.canManage && subscription && (subscription.active || subscription.pastDue) && (
          <PortalButton label={subscription.pastDue ? t('billing.actions.invoices') : t('billing.actions.manage')} />
        )}
      </div>
    </Card>
  )
}
