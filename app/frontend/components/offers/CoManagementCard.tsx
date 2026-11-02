import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { NumberInput } from '@/components/finances/NumberInput'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { formatNumber, t } from '@/lib/i18n'
import type { OfferInputs, OfferResult } from '@/types/offers'
import { euros } from './shared'

type Props = { inputs: OfferInputs; result: OfferResult; readOnly: boolean; onChange: (inputs: OfferInputs) => void }

/**
 * « 4 ···· Co-gestion »: offered or not. When it is, the half-days year by
 * year (often fewer each year, as the place and its people grow), each one
 * a visit with its round trip, at the hourly rate.
 */
export function CoManagementCard({ inputs, result, readOnly, onChange }: Props) {
  const spec = inputs.co_management
  const estimate = result.co_management
  const enabled = spec.enabled
  // Until the team writes its own years, the rate's default stands for year 1.
  const years = spec.years.length ? spec.years : [inputs.settings.co_management_half_days]
  const set = (patch: Partial<OfferInputs['co_management']>) => onChange({ ...inputs, co_management: { ...spec, ...patch } })
  const setYear = (index: number, value: number) => set({ years: years.map((half, i) => (i === index ? value : half)) })
  const addYear = () => set({ years: [...years, Math.max(0, Math.round((years[years.length - 1] ?? 2) / 2))] })
  const removeYear = (index: number) => set({ years: years.filter((_, i) => i !== index) })

  return (
    <Card className={clsx('space-y-4', !enabled && 'bg-loam-50/70')}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={clsx('font-serif text-xl font-semibold', enabled ? 'text-prune-800' : 'text-loam-500')}>
          <span className="font-serif text-leaf-700">{t('offers.co_management.number')}</span> {t('offers.co_management.title')}
        </h3>
        <label className="inline-flex items-center gap-1.5 text-sm font-medium text-loam-700">
          <input
            type="checkbox"
            className="rounded border-loam-300 text-prune-600 focus:ring-prune-600"
            checked={enabled}
            disabled={readOnly}
            onChange={(e) => set({ enabled: e.target.checked, years })}
          />
          {t('offers.budget.in_offer')}
        </label>
      </header>

      {!enabled ? (
        <p className="text-sm text-loam-500">{t('offers.co_management.off')}</p>
      ) : (
        <>
          <p className="text-sm text-loam-600">{t('offers.co_management.help', { hours: formatNumber(inputs.settings.half_day_hours) })}</p>
          <ul className="divide-y divide-loam-100 text-sm">
            {(estimate.years ?? []).map((year, index) => (
              <li key={year.year} className="grid grid-cols-[5rem_6.5rem_minmax(0,1fr)_2rem] items-center gap-2 py-1.5">
                <span className="text-loam-700">{t('offers.co_management.year', { year: year.year })}</span>
                <NumberInput aria-label={t('offers.co_management.half_days')} value={years[index]} unit={t('offers.co_management.half_days_unit')} disabled={readOnly} onValue={(value) => setYear(index, value ?? 0)} />
                <span className="text-right text-loam-500">
                  {t('offers.co_management.year_detail', { hours: formatNumber(year.hours), trips: euros(year.trips_htva) })}
                  {' · '}<span className="tabular-nums text-loam-900">{euros(year.amount_tvac)} TVAC</span>
                </span>
                {readOnly || years.length < 2 ? <span /> : (
                  <IconButton size="sm" tone="danger" className="justify-self-end" label={t('offers.co_management.remove_year')} onClick={() => removeYear(index)}>
                    <Trash2 aria-hidden />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {!readOnly && years.length < 10 ? (
              <Button variant="ghost" size="sm" onClick={addYear}>
                <Plus className="h-3.5 w-3.5" aria-hidden />{t('offers.co_management.add_year')}
              </Button>
            ) : <span />}
            <label className="flex items-center gap-2 text-sm text-loam-600">
              {t('offers.co_management.one_way_km')}
              <span className="w-24">
                <NumberInput aria-label={t('offers.co_management.one_way_km')} value={spec.one_way_km ?? estimate.one_way_km ?? null} unit="km" disabled={readOnly} className={clsx(spec.one_way_km != null && 'bg-humus-50')} onValue={(value) => set({ one_way_km: value })} />
              </span>
            </label>
          </div>
          <p className="flex items-baseline justify-between gap-2 rounded-xl bg-loam-50 p-3 text-sm">
            <span className="text-loam-700">{t('offers.co_management.total', { half_days: formatNumber(estimate.half_days), years: (estimate.years ?? []).length })}</span>
            <span className="font-medium tabular-nums">{euros(estimate.amount_tvac)} TVAC</span>
          </p>
        </>
      )}
    </Card>
  )
}
