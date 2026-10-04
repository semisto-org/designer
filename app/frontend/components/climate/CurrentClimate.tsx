import { Info } from 'lucide-react'
import { t } from '@/lib/i18n'
import { ZoneBadge } from '@/components/climate/ZoneBadge'
import { formatMm, formatMonthDay, formatTemp } from '@/components/climate/format'
import type { CurrentClimate as CurrentClimateData } from '@/types/climate_finance'

/** Today's hardiness zone and climate normals of the map's location. */
export function CurrentClimate({ data }: { data: CurrentClimateData }) {
  const n = data.normals
  const rows: [string, string][] = [
    [t('climate.current.normals.mean_temp'), formatTemp(n.meanTempC)],
    [t('climate.current.normals.annual_precip'), formatMm(n.annualPrecipMm)],
    [t('climate.current.normals.summer_mean_temp'), formatTemp(n.summerMeanTempC)],
    [t('climate.current.normals.winter_mean_temp'), formatTemp(n.winterMeanTempC)],
    [t('climate.current.normals.frost_days'), n.frostDays == null ? '—' : t('climate.current.days', { count: n.frostDays })],
    [t('climate.current.normals.frost_free_days'), n.frostFreeDays == null ? '—' : t('climate.current.days', { count: n.frostFreeDays })],
    [t('climate.current.normals.last_spring_frost'), t('climate.current.around', { date: formatMonthDay(n.lastSpringFrost) })],
    [t('climate.current.normals.first_autumn_frost'), t('climate.current.around', { date: formatMonthDay(n.firstAutumnFrost) })],
  ]
  return (
    <section aria-labelledby="climate-current" className="space-y-3">
      <SectionTitle id="climate-current">{t('climate.current.title')}</SectionTitle>
      {data.zone && (
        <div className="flex items-center gap-3">
          <ZoneBadge code={data.zone.code} size="lg" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-loam-900">
              {t('climate.current.zone_label')} {data.zone.code}
              <span className="ml-1.5 rounded bg-loam-100 px-1.5 py-0.5 align-middle text-[11px] font-normal text-loam-600">{t('climate.indicative')}</span>
            </p>
            <p className="text-loam-600">{t('climate.current.zone_hint', { temp: formatTemp(n.extremeMinC) })}</p>
          </div>
        </div>
      )}
      <details className="group text-xs text-loam-600">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-prune-700 hover:underline">
          <Info className="h-3.5 w-3.5" aria-hidden />
          {t('climate.current.sub_area')} : {data.subArea.name}
        </summary>
        <p className="mt-1.5">{data.subArea.description}</p>
        <p className="mt-1.5">{t('climate.current.zone_help')}</p>
      </details>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-loam-50 px-2.5 py-2">
            <dt className="text-[11px] leading-tight text-loam-500">{label}</dt>
            <dd className="font-medium text-loam-900">{value}</dd>
          </div>
        ))}
      </dl>
      {data.referencePeriod && <p className="text-[11px] text-loam-500">{t('climate.current.reference', { period: data.referencePeriod })}</p>}
    </section>
  )
}

export function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-loam-500">{children}</h3>
}
