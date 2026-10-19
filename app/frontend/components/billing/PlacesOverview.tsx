import { Link, router } from '@inertiajs/react'
import { ChevronDown, FlaskConical, Lock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatArea, t } from '@/lib/i18n'
import { formatBytes, formatDate } from '@/lib/money'
import type { BillingData, GrantData } from '@/types/billing'
import { PlaceThumb } from './PlaceThumb'
import { UsageMeter } from './UsageMeter'

const SHOWN = 6

/** The first of next month, when « Mettre en image » starts again. */
function nextMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

/** When the plan ends or renews, in one sentence; null when it never does. */
export function planEnd(billing: BillingData): { date: string; kind: 'pass' | 'subscription' | 'canceling' | 'grant' } | null {
  const { pass, subscription, grants } = billing
  if (subscription?.active && subscription.currentPeriodEnd) {
    return { date: subscription.currentPeriodEnd, kind: subscription.cancelAtPeriodEnd ? 'canceling' : 'subscription' }
  }
  if (pass) return { date: pass.expiresAt, kind: 'pass' }
  const grant = grants.find((g) => g.active)
  if (grant) return { date: grant.endsAt, kind: 'grant' }
  return null
}

/**
 * The top of « Formule et facturation »: what the plan does for the
 * person's places (their names, the counters), when it renews, and the
 * honest answer to « Et si j'arrête ? ».
 */
export function PlacesOverview({ billing }: { billing: BillingData }) {
  const { plan, places, storage } = billing
  const expired = plan === 'free' && billing.expiredPass
  const planName = plan === 'free' ? t('billing.plans.free.name') : t(`billing.plans.${plan}.name`)
  const unlimited = !billing.enabled
  const maxMaps = Number.isFinite(billing.maxMaps) && billing.maxMaps < 1000 ? billing.maxMaps : null
  const end = planEnd(billing)

  return (
    <section aria-labelledby="places-title" className="mt-6 rounded-2xl bg-loam-50 p-5 ring-1 ring-loam-900/10 sm:p-7">
      <p className="font-hand text-2xl leading-none text-prune-600">{plan === 'free' ? t('billing.places.kicker_free') : t('billing.places.kicker', { plan: planName })}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 id="places-title" className="text-2xl">
            {expired ? t('billing.status.expired_title') : plan === 'free' ? t('billing.status.free_title') : t('billing.places.title', { plan: planName })}
          </h2>
          <div className="mt-2 space-y-1.5 text-sm text-loam-600">
            <RenewalLines billing={billing} />
          </div>
        </div>
        {billing.canManage && billing.subscription && (billing.subscription.active || billing.subscription.pastDue) && (
          <PortalButton label={billing.subscription.pastDue ? t('billing.actions.invoices') : t('billing.actions.manage')} />
        )}
      </div>

      {unlimited && (
        <div className="mt-5 flex gap-3 rounded-xl bg-humus-50 p-4 text-humus-700 ring-1 ring-humus-200">
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('billing.status.beta_title')}</p>
            <p className="mt-1 text-sm">{t('billing.status.beta_body')}</p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <UsageMeter
          label={t('billing.places.meters.maps')}
          value={String(places.activeCount)}
          limit={unlimited || maxMaps === null ? null : String(maxMaps)}
          ratio={unlimited || maxMaps === null ? null : places.activeCount / maxMaps}
          hint={places.archivedCount > 0 ? t('billing.places.archived', { count: places.archivedCount }) : t('billing.places.meters.maps_hint')}
        />
        <UsageMeter
          label={t('billing.places.meters.storage')}
          value={formatBytes(storage.usedBytes)}
          limit={storage.limitBytes === null ? null : formatBytes(storage.limitBytes)}
          ratio={storage.limitBytes ? storage.usedBytes / storage.limitBytes : null}
          hint={storage.limitBytes === null ? t('billing.places.meters.unlimited') : t('billing.places.meters.storage_hint')}
        />
        <UsageMeter
          label={t('billing.places.meters.renderings')}
          value={String(places.renderings.used)}
          limit={places.renderings.limit > 0 ? String(places.renderings.limit) : null}
          ratio={places.renderings.limit > 0 ? places.renderings.used / places.renderings.limit : null}
          hint={places.renderings.limit > 0
            ? t('billing.places.meters.renderings_hint', { date: formatDate(nextMonth()) })
            : t('billing.places.meters.renderings_none')}
        />
      </div>

      <PlaceList billing={billing} />

      <StopAnswer billing={billing} end={end} />
    </section>
  )
}

function PlaceList({ billing }: { billing: BillingData }) {
  const { places } = billing
  const [all, setAll] = useState(false)
  if (places.maps.length === 0) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-loam-300 p-4">
        <PlaceThumb boundary={null} />
        <p className="min-w-0 flex-1 text-sm text-loam-700">{t('billing.places.empty')}</p>
        <Link href="/maps/new" className="text-sm font-semibold text-prune-700 underline underline-offset-2 hover:text-prune-800">{t('billing.places.empty_cta')}</Link>
      </div>
    )
  }
  const shown = all ? places.maps : places.maps.slice(0, SHOWN)
  const hidden = places.activeCount - shown.length
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-loam-800">{t('billing.places.maps_title')}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((map) => (
          <li key={map.id}>
            <Link href={`/maps/${map.id}`} className="flex items-center gap-3 rounded-xl bg-white p-2 pr-3 ring-1 ring-loam-200 transition-colors hover:ring-prune-300">
              <PlaceThumb boundary={map.boundary} size={48} muted={map.readOnly} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-loam-900">{map.name}</span>
                <span className="flex items-center gap-1 text-sm text-loam-500">
                  {map.readOnly ? <><Lock className="h-3.5 w-3.5 text-humus-700" aria-hidden="true" />{t('billing.places.read_only')}</> : map.areaM2 ? formatArea(map.areaM2) : t('billing.places.no_outline')}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        all || places.maps.length <= SHOWN
          ? <p className="mt-2 text-sm text-loam-500">{t('billing.places.more', { count: hidden })}</p>
          : <button type="button" onClick={() => setAll(true)} className="mt-2 text-sm font-medium text-prune-700 hover:text-prune-800">{t('billing.places.show_all', { count: places.activeCount })}</button>
      )}
    </div>
  )
}

/** « Et si j'arrête ? »: what stays, what pauses, and that nothing is deleted. */
function StopAnswer({ billing, end }: { billing: BillingData; end: ReturnType<typeof planEnd> }) {
  const { plan, places } = billing
  const [open, setOpen] = useState(false)
  const paying = plan !== 'free'
  const others = Math.max(places.activeCount - places.freeMaxMaps, 0)
  return (
    <div className="mt-6 border-t border-dashed border-loam-300 pt-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="font-hand text-2xl leading-none text-loam-800">{t('billing.stop.question')}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-loam-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-3 max-w-2xl space-y-2 text-sm text-loam-700">
          {!paying && <p>{t('billing.stop.free')}</p>}
          {paying && end?.kind === 'pass' && <p>{t('billing.stop.pass', { date: formatDate(end.date) })}</p>}
          {paying && (end?.kind === 'subscription' || end?.kind === 'canceling') && <p>{t('billing.stop.subscription', { date: formatDate(end.date) })}</p>}
          {paying && end?.kind === 'grant' && <p>{t('billing.stop.grant', { date: formatDate(end.date) })}</p>}
          {paying && (
            <>
              {places.keptOnFree
                ? <p>{t('billing.stop.kept', { name: places.keptOnFree.name })}{others > 0 && ` ${t('billing.stop.others_read_only', { count: others })}`}</p>
                : <p>{t('billing.stop.team')}</p>}
              <p>{t('billing.stop.paused')}</p>
              <p>{t('billing.stop.storage', { limit: formatBytes(places.freeStorageBytes) })}</p>
            </>
          )}
          <p className="font-medium text-loam-900">{t('billing.stop.nothing_deleted')}</p>
          {paying && <p>{t('billing.stop.come_back')}</p>}
        </div>
      )}
    </div>
  )
}

function RenewalLines({ billing }: { billing: BillingData }) {
  const { plan, pass, expiredPass, subscription } = billing
  const expired = plan === 'free' && expiredPass
  return (
    <>
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
      <GrantLines grants={billing.grants} />
      {subscription && (
        <>
          {subscription.active && subscription.currentPeriodEnd && !subscription.cancelAtPeriodEnd && (
            <p className="font-medium text-loam-800">{t('billing.status.subscription_next', { date: formatDate(subscription.currentPeriodEnd) })}</p>
          )}
          {subscription.active && subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <p className="font-medium text-humus-700">{t('billing.status.subscription_canceling', { date: formatDate(subscription.currentPeriodEnd) })}</p>
          )}
          {subscription.pastDue && <p className="font-medium text-clay-700">{t('billing.status.subscription_past_due')}</p>}
          {!subscription.active && !subscription.pastDue && <p>{t('billing.status.subscription_ended')}</p>}
        </>
      )}
      {!expired && billing.readOnlyMaps > 0 && plan !== 'free' && (
        <p className="font-medium text-humus-700">{t('billing.status.read_only_maps', { count: billing.readOnlyMaps })}</p>
      )}
      {billing.paidTeams.length > 0 && (
        <p className="text-loam-500">
          {t('team_billing.billing_page', { count: billing.paidTeams.length })}{' '}
          {billing.paidTeams.map((team, index) => (
            <span key={team.id}>{index > 0 && ', '}<Link href={`/teams/${team.id}`} className="font-medium text-prune-700 underline underline-offset-2">{team.name}</Link></span>
          ))}
        </p>
      )}
      {billing.personalMaps && (
        <>
          <p className="text-loam-500">
            {t('team_billing.personal_maps', { used: billing.personalMaps.used, max: billing.personalMaps.max })}
            {billing.personalMaps.storage.limitBytes !== null && ` ${t('billing.storage.used', { used: formatBytes(billing.personalMaps.storage.usedBytes), limit: formatBytes(billing.personalMaps.storage.limitBytes) })}`}
          </p>
          {billing.personalMaps.readOnly > 0 && (
            <p className="font-medium text-humus-700">{t('team_billing.personal_read_only', { count: billing.personalMaps.readOnly })}</p>
          )}
        </>
      )}
    </>
  )
}

/** Plans paid on invoice or given by Semisto: the running one (until when) and the next one. */
export function GrantLines({ grants }: { grants: GrantData[] }) {
  return (
    <>
      {grants.map((grant) => {
        const plan = t(`billing.plans.${grant.planKey}.name`)
        if (!grant.active) {
          return <p key={grant.id}>{t('invoicing.billing.grant_upcoming', { plan, start: formatDate(grant.startsAt), end: formatDate(grant.endsAt) })}</p>
        }
        return (
          <div key={grant.id} className="space-y-1.5">
            <p className="font-medium text-loam-800">
              {t(grant.onInvoice ? 'invoicing.billing.grant_until' : 'invoicing.billing.grant_until_manual', { plan, date: formatDate(grant.endsAt) })}
            </p>
            <p>{t('invoicing.billing.grant_days', { count: grant.daysLeft })} {t(grant.onInvoice ? 'invoicing.billing.grant_renew_note' : 'invoicing.billing.grant_gift_note')}</p>
          </div>
        )
      })}
    </>
  )
}

export function PortalButton({ label, variant = 'secondary' }: { label: string; variant?: 'primary' | 'secondary' }) {
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
