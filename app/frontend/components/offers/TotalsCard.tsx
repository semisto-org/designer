import { TriangleAlert } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { OfferResult, OfferWarning } from '@/types/offers'
import { euros, phaseLabel, PhaseMark } from './shared'

/**
 * The offer as the client will add it up: each phase's price, plants and
 * supplies, the total and how far the extensions could take it, then the
 * co-management estimate and the hourly rate for extra work.
 */
export function TotalsCard({ result }: { result: OfferResult }) {
  const { totals, co_management: coManagement } = result
  return (
    <section className="space-y-4 rounded-2xl bg-prune-50 p-5 shadow-sm ring-1 ring-prune-200">
      <h2 className="font-serif text-xl font-semibold text-prune-800">{t('offers.totals.title')}</h2>
      <ul className="divide-y divide-loam-100 text-sm">
        {result.phases.map((phase) => (
          <li key={phase.key} className="flex justify-between gap-2 py-1.5">
            <span className="text-loam-700"><PhaseMark phase={phase.key} /> {phaseLabel(phase.key)}</span>
            <span className="tabular-nums">{euros(phase.price_tvac)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-2 py-1.5">
          <span className="text-loam-700">{t('offers.totals.plants')}</span>
          <span className="tabular-nums">{euros(totals.plants_supplies_base_tvac)}</span>
        </li>
      </ul>
      <div className="flex items-baseline justify-between gap-2 border-t border-prune-200 pt-3">
        <span className="font-semibold text-prune-900">{t('offers.totals.total')}</span>
        <span className="font-serif text-2xl font-semibold tabular-nums text-prune-900">{euros(totals.total_tvac)}</span>
      </div>
      <DesignShare result={result} />
      {totals.total_max_tvac > totals.total_tvac && (
        <p className="text-xs text-loam-500">{t('offers.totals.max', { amount: euros(totals.total_max_tvac) })}</p>
      )}
      <p className="text-sm text-loam-600">
        <strong className="font-medium text-loam-800">{t('offers.co_management.title')}.</strong>{' '}
        {t('offers.co_management.text', { half_days: coManagement.half_days, hours: coManagement.hours, amount: euros(coManagement.amount_tvac) })}
      </p>
      <p className="text-xs text-loam-500">{t('offers.totals.regie', { rate: euros(result.regie_rate_tvac) })}</p>
    </section>
  )
}

/**
 * Where the client's money goes: design on one side, planting on the other,
 * against the share of design the pricing aims at; and what the Designer
 * took off the design.
 */
function DesignShare({ result }: { result: OfferResult }) {
  const { totals, target_design_share_pct: target } = result
  if (totals.design_share_pct == null) return null
  const share = totals.design_share_pct
  return (
    <div className="space-y-1.5">
      <div className="relative flex h-3 overflow-hidden rounded-full bg-leaf-200" aria-hidden>
        <div className={share > target ? 'bg-humus-500' : 'bg-prune-500'} style={{ width: `${Math.min(share, 100)}%` }} />
        {target > 0 && <div className="absolute inset-y-0 w-0.5 bg-prune-900/60" style={{ left: `${target}%` }} />}
      </div>
      <p className="text-xs text-loam-600">
        {t('offers.totals.share', { design: euros(totals.design_tvac), share: Math.round(share), implementation: euros(totals.implementation_tvac) })}
        {' '}{t('offers.totals.share_target', { target })}
      </p>
      {totals.saved_tvac > 0 && <p className="text-xs text-leaf-800">{t('offers.totals.saved', { amount: euros(totals.saved_tvac) })}</p>}
    </div>
  )
}

export function warningText(warning: OfferWarning): string {
  return t(`offers.warnings.${warning.code}`, {
    label: warning.label ?? '',
    phase: warning.phase ? phaseLabel(warning.phase) : '',
    ceiling: warning.ceiling != null ? euros(warning.ceiling) : '',
    share: warning.share != null ? Math.round(warning.share) : '',
    target: warning.target ?? '',
  })
}

export function Warnings({ warnings }: { warnings: OfferWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <ul className="space-y-2" aria-live="polite">
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${index}`} className="flex gap-2 rounded-xl bg-humus-50 p-3 text-sm text-humus-800 ring-1 ring-inset ring-humus-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {warningText(warning)}
        </li>
      ))}
    </ul>
  )
}
