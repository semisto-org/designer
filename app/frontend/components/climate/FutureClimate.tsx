import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { t } from '@/lib/i18n'
import { SectionTitle } from '@/components/climate/CurrentClimate'
import { ZoneBadge } from '@/components/climate/ZoneBadge'
import { formatDelta, formatPct, formatTemp } from '@/components/climate/format'
import type { Horizon, ProjectionData, ProjectionsBlock, Scenario, Unavailable, ZoneData } from '@/types/climate_finance'

const HORIZONS: Horizon[] = ['2050', '2080']

type Props = {
  block: Extract<ProjectionsBlock, { available: true }>
  current: ZoneData | null
  scenario: Scenario
  onScenario: (scenario: Scenario) => void
}

/** Projected zones and climate for 2050 and 2080, with a scenario switch. */
export function FutureClimate({ block, current, scenario, onScenario }: Props) {
  const ipcc = block.scenarios.find((s) => s.key === scenario)?.ipcc ?? ''
  const projections = HORIZONS.map((h) => block.horizons[h]?.[scenario]).filter(isProjection)
  return (
    <section aria-labelledby="climate-future" className="space-y-3">
      <SectionTitle id="climate-future">{t('climate.future.title')}</SectionTitle>
      <ScenarioSwitch value={scenario} onChange={onScenario} options={block.scenarios.map((s) => s.key)} />
      <p className="text-xs text-loam-500">{t(`climate.future.scenario_hints.${scenario}`, { ipcc })}</p>
      <ul className="space-y-2">
        {projections.map((p) => (
          <li key={p.horizon} className="rounded-lg bg-humus-50/60 p-3 ring-1 ring-inset ring-humus-100">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold text-loam-900">{p.horizon}</span>
                {p.period && <span className="text-xs text-loam-500">{p.period}</span>}
              </p>
              <p className="flex items-center gap-1.5" aria-label={t('climate.future.zone_from_to', { from: current?.code ?? '—', to: p.zone.code })}>
                {current && <span className="text-sm font-medium text-loam-500" aria-hidden>{current.code}</span>}
                <ArrowRight className="h-3.5 w-3.5 text-loam-400" aria-hidden />
                <ZoneBadge code={p.zone.code} tone="future" />
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs leading-snug">
              <dt className="text-loam-500">{t('climate.future.coldest_night')}</dt>
              <dd className="tabular-nums text-loam-800">{formatTemp(p.extremeMinC)}</dd>
              <dt className="text-loam-500">{t('climate.future.mean')}</dt>
              <dd className="tabular-nums text-loam-800">
                {formatDelta(p.deltas.meanTempC[1])}{' '}
                <span className="text-loam-500">{t('climate.future.range', { low: formatDelta(p.deltas.meanTempC[0]), high: formatDelta(p.deltas.meanTempC[2]) })}</span>
              </dd>
              <dt className="text-loam-500">{t('climate.future.summer')}</dt>
              <dd className="tabular-nums text-loam-800">{t('climate.future.summer_value', { delta: formatDelta(p.deltas.summerTempC[1]), precip: formatPct(p.deltas.summerPrecipPct[1]) })}</dd>
            </dl>
          </li>
        ))}
      </ul>
      {projections.length > 0 && (
        <div className="space-y-2 text-sm text-loam-700">
          {projections.map((p) => <p key={p.horizon}>{explanation(p, current)}</p>)}
          <p className="text-xs text-loam-500">{t('climate.future.late_frost')}</p>
        </div>
      )}
    </section>
  )
}

function isProjection(value: ProjectionData | Unavailable | undefined): value is ProjectionData {
  return !!value && value.available
}

function explanation(p: ProjectionData, current: ZoneData | null): string {
  const vars = {
    horizon: p.horizon,
    scenario: t(`climate.future.scenario_inline.${p.scenario}`),
    from: current?.code ?? '—',
    to: p.zone.code,
    summer: formatDelta(p.deltas.summerTempC[1]),
    precip: formatPct(p.deltas.summerPrecipPct[1]),
  }
  return t(current && current.code === p.zone.code ? 'climate.future.explanation_same' : 'climate.future.explanation_change', vars)
}

export function ScenarioSwitch({ value, onChange, options }: { value: Scenario; onChange: (s: Scenario) => void; options: Scenario[] }) {
  return (
    <div role="radiogroup" aria-label={t('climate.future.scenario_label')} className="grid grid-cols-2 gap-1 rounded-lg bg-loam-100 p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={clsx(
            'rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-prune-600',
            value === option ? 'bg-white text-prune-700 shadow-sm' : 'text-loam-600 hover:text-loam-900',
          )}
        >
          {t(`climate.future.scenarios.${option}`)}
        </button>
      ))}
    </div>
  )
}
