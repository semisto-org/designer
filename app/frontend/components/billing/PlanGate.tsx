import { usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { formatPrice } from '@/lib/money'
import type { SharedProps } from '@/types'
import type { SketchGeometry } from '@/types/myMaps'
import { PlaceThumb } from './PlaceThumb'

export type GateFeature = 'relief' | 'climate' | 'soil' | 'pdf' | 'dossier_terrain' | 'dossier_climate' | 'dossier_soil'

type Props = {
  feature: GateFeature
  /** The place it would unlock: its name and outline are shown. */
  place?: { id: number; name: string; boundary?: SketchGeometry | null } | null
  /** The person can change the plan that covers this map (its payer). */
  canUpgrade: boolean
  /** The editor panel to reopen after paying (else the current page). */
  panel?: string
  /** A line about this place (« 12 espèces attendent… »). */
  children?: ReactNode
  /** Copy override for the body (e.g. the month's quota with its figure). */
  body?: string
  className?: string
}

/** Where to come back after paying: the panel of this map, or the page as it is. */
export function returnPath(mapId?: number, panel?: string) {
  if (mapId && panel) return `/maps/${mapId}?panel=${panel}`
  if (typeof window === 'undefined') return mapId ? `/maps/${mapId}` : '/maps'
  return window.location.pathname + window.location.search
}

/** The plans page with the right plan in view and the way back. */
export function plansHref({ plan, returnTo }: { plan?: string; returnTo?: string | null } = {}) {
  const params = new URLSearchParams()
  if (plan) params.set('plan', plan)
  if (returnTo) params.set('return_to', returnTo)
  const query = params.toString()
  return query ? `/billing?${query}` : '/billing'
}

/**
 * One door for every paid feature: what it unlocks on this place, the
 * price, and a way back to this exact spot once paid. Never blocks what is
 * already there; on screen only (hidden in print).
 */
export function PlanGate({ feature, place, canUpgrade, panel, children, body, className }: Props) {
  const { currentUser, env } = usePage().props as unknown as SharedProps
  const pro = currentUser?.accountKind === 'professional'
  const plan = pro ? 'atelier' : 'yearly'
  const price = pro
    ? t('plan_gates.price_pro', { price: formatPrice(env.planPrices.atelier) })
    : t('plan_gates.price_home', { price: formatPrice(env.planPrices.yearly) })
  const name = place?.name

  return (
    <section aria-label={t(`plan_gates.${feature}.title`)} className={clsx('rounded-2xl bg-loam-50 p-4 text-sm ring-1 ring-loam-900/10 print:hidden', className)}>
      <div className="flex items-start gap-3">
        {place && <PlaceThumb boundary={place.boundary ?? null} size={48} />}
        <div className="min-w-0">
          {name && <p className="truncate font-hand text-xl leading-none text-prune-600">{t('plan_gates.on_place', { place: name })}</p>}
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-semibold text-loam-900">
            <Lock className="h-4 w-4 shrink-0 text-prune-600" aria-hidden="true" />
            {t(`plan_gates.${feature}.title`)}
          </h3>
        </div>
      </div>
      <p className="mt-2 text-loam-700">{body ?? t(`plan_gates.${feature}.body`)}</p>
      {children && <div className="mt-2 text-loam-700">{children}</div>}
      {canUpgrade ? (
        <div className="mt-3 space-y-2">
          <a href={plansHref({ plan, returnTo: returnPath(place?.id, panel) })} className={buttonClass('primary', 'sm', 'w-full')}>
            {t('plan_gates.cta')}
          </a>
          <p className="text-loam-500">{price} {t('plan_gates.kept')}</p>
        </div>
      ) : (
        <p className="mt-3 text-loam-500">{t('plan_gates.owner_only')}</p>
      )}
    </section>
  )
}
