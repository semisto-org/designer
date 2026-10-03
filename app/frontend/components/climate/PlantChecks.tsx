import { Droplets, Flame, Snowflake } from 'lucide-react'
import { t } from '@/lib/i18n'
import { SectionTitle } from '@/components/climate/CurrentClimate'
import { StatusPill } from '@/components/climate/StatusPill'
import { formatTemp } from '@/components/climate/format'
import type { Horizon, PlantCheckItem, PlantRisk, PlantStatus, PlantsBlock, Scenario } from '@/types/climate_finance'

const ORDER: PlantStatus[] = ['at_risk', 'borderline', 'ok', 'unknown']
const RISK_ICONS: Record<PlantRisk, typeof Snowflake> = { cold: Snowflake, heat: Flame, drought: Droplets }
const HORIZONS: Horizon[] = ['2050', '2080']

/** Each plant of the map against today's and the projected climate. */
export function PlantChecks({ block, scenario }: { block: Extract<PlantsBlock, { available: true }>; scenario: Scenario }) {
  const sorted = [...block.items].sort((a, b) => worst(a, scenario) - worst(b, scenario) || a.name.localeCompare(b.name, 'fr'))
  const items = sorted.filter((item) => !isUnknown(item))
  const unknown = sorted.filter(isUnknown)
  return (
    <section aria-labelledby="climate-plants" className="space-y-2">
      <SectionTitle id="climate-plants">{t('climate.plants.title')}</SectionTitle>
      {sorted.length === 0 ? (
        <p className="rounded-lg bg-loam-50 p-3 text-sm text-loam-600">{t('climate.plants.empty')}</p>
      ) : (
        <>
          <p className="text-xs text-loam-600">
            {t('climate.plants.count', { count: block.count })}
            {' · '}
            {ORDER.filter((s) => block.summary.today[s]).map((s) => t(`climate.plants.summary.${s}`, { count: block.summary.today[s] ?? 0 })).join(' · ')}
          </p>
          {items.length > 0 && (
            <div>
              <div className="grid grid-cols-3 gap-1 border-b border-loam-100 pb-1 text-[11px] font-medium text-loam-500" aria-hidden>
                <span>{t('climate.plants.today_long')}</span>
                {HORIZONS.map((h) => <span key={h}>{h}</span>)}
              </div>
              <ul className="divide-y divide-loam-100">
                {items.map((item) => <PlantRow key={item.key} item={item} scenario={scenario} />)}
              </ul>
            </div>
          )}
          {unknown.length > 0 && (
            <div className="rounded-lg bg-loam-50 p-2.5 text-xs text-loam-600">
              <p className="font-medium text-loam-700">{t('climate.plants.unknown_group', { count: unknown.length })}</p>
              <p className="mt-0.5">{unknown.map((item) => item.name).join(', ')}</p>
              <p className="mt-1 text-loam-500">{t('climate.plants.unknown_hint')}</p>
            </div>
          )}
          <p className="text-[11px] text-loam-500">{t('climate.plants.checks_note')}</p>
        </>
      )}
    </section>
  )
}

function PlantRow({ item, scenario }: { item: PlantCheckItem; scenario: Scenario }) {
  const columns = [
    { key: 'today', label: t('climate.plants.today_long'), check: item.today },
    ...HORIZONS.map((h) => ({ key: h, label: h, check: item.future[h]?.[scenario] })),
  ]
  const risks = columns
    .filter((c) => c.check && c.check.risks.length > 0 && c.check.status !== 'ok')
    .map((c) => t('climate.plants.risk_at', { when: c.label, risks: c.check!.risks.map((r) => t(`climate.plants.risks.${r}`)).join(', ') }))
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-loam-900">
          {item.name}
          {item.latinName && item.latinName !== item.name && <span className="latin ml-1 font-normal text-loam-500">{item.latinName}</span>}
        </p>
        {item.quantity > 0 && <span className="shrink-0 text-xs text-loam-500">{t('climate.plants.quantity', { count: item.quantity })}</span>}
      </div>
      <p className="text-[11px] text-loam-500">
        {item.coldLimitC != null ? t('climate.plants.cold_limit', { temp: formatTemp(item.coldLimitC) }) : t('climate.plants.unknown_traits')}
      </p>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {columns.map((c) => (
          <span key={c.key} className="min-w-0">
            {c.check && <StatusPill status={c.check.status} prefix={c.label} hidePrefix />}
          </span>
        ))}
      </div>
      {risks.length > 0 && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-loam-600">
          <span className="mt-px flex shrink-0 gap-0.5" aria-hidden>
            {[...new Set(columns.flatMap((c) => (c.check && c.check.status !== 'ok' ? c.check.risks : [])))].map((r) => {
              const Icon = RISK_ICONS[r]
              return <Icon key={r} className="h-3 w-3 text-loam-500" />
            })}
          </span>
          <span>{risks.join(' · ')}</span>
        </p>
      )}
    </li>
  )
}

/** Nothing known about this plant's hardiness, heat or drought tolerance. */
const isUnknown = (item: PlantCheckItem) => !item.traitsKnown

function worst(item: PlantCheckItem, scenario: Scenario): number {
  const statuses = [item.today.status, ...HORIZONS.map((h) => item.future[h]?.[scenario]?.status ?? 'unknown')]
  return Math.min(...statuses.map((s) => ORDER.indexOf(s)))
}
