import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { tf, values } from '@/lib/content'
import { formatPrice } from '@/lib/money'
import type { BillingInterval, CatalogPlan } from '@/types/billing'

/**
 * One plan of the catalogue (pricing page and billing page). The action is the
 * caller's button. `interval` picks the monthly or yearly price of Pro and Team.
 */
export function PlanCard({ plan, interval = 'month', action, badge, highlighted, current, className }: {
  plan: CatalogPlan
  interval?: BillingInterval
  action?: ReactNode
  badge?: string
  highlighted?: boolean
  current?: boolean
  className?: string
}) {
  const base = `billing.plans.${plan.key}`
  const features = values(`${base}.features`)
  const yearly = interval === 'year' && plan.yearlyPriceCents !== null
  const priceCents = yearly ? plan.yearlyPriceCents! : plan.priceCents
  const priceNote = plan.key === 'free' ? null : yearly ? tf('billing.interval.per_year') : tf(`${base}.price_note`)
  let offerNote: string | null = null
  if (yearly && plan.launchPriceCents !== null) offerNote = tf('billing.launch_offer', { price: formatPrice(plan.launchPriceCents) })
  else if (!yearly && plan.yearlyPriceCents !== null) offerNote = tf('billing.yearly_option', { price: formatPrice(plan.yearlyPriceCents) })
  const renewalNote = plan.key === 'free' ? null : tf(`${base}.renewal_note`)
  return (
    <article
      className={clsx(
        'relative flex flex-col rounded-2xl bg-white p-6 shadow-sm',
        highlighted ? 'ring-2 ring-prune-500' : 'ring-1 ring-loam-200/80',
        current && 'ring-2 ring-leaf-500',
        className,
      )}
    >
      {badge && (
        <span className="absolute -top-3 left-6 rounded-full bg-prune-600 px-3 py-0.5 text-sm font-semibold text-white">{badge}</span>
      )}
      <h3 className="text-lg text-loam-900">{tf(`${base}.name`)}</h3>
      <p className="mt-1 sm:min-h-[2.6rem] text-sm text-loam-500">{tf(`${base}.tagline`)}</p>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className="text-4xl font-semibold tracking-tight text-loam-900">{formatPrice(priceCents)}</span>
        {priceNote && <span className="text-sm text-loam-500">{priceNote}</span>}
      </p>
      {offerNote && <p className="mt-1 text-sm text-loam-600">{offerNote}</p>}
      {renewalNote && <p className="mt-1 text-sm font-medium text-leaf-700">{renewalNote}</p>}
      <ul className="mt-5 flex-1 space-y-2.5 text-sm text-loam-700">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-500" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {action && <div className="mt-6">{action}</div>}
    </article>
  )
}
