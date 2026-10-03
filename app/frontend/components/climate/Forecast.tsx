import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, TriangleAlert } from 'lucide-react'
import { t } from '@/lib/i18n'
import { SectionTitle } from '@/components/climate/CurrentClimate'
import { formatDates, formatMm, formatTemp, formatWeekday, weatherKind, type WeatherKind } from '@/components/climate/format'
import type { ForecastReport } from '@/types/climate_finance'

const ICONS: Record<WeatherKind, typeof Sun> = {
  clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle,
  rain: CloudRain, snow: CloudSnow, showers: CloudRain, storm: CloudLightning,
}

/** 7-day forecast with frost and heat alerts, or "coming soon". */
export function Forecast({ report, loading }: { report: ForecastReport | null; loading: boolean }) {
  return (
    <section aria-labelledby="climate-forecast" className="space-y-2">
      <SectionTitle id="climate-forecast">{t('climate.forecast.title')}</SectionTitle>
      {loading && <p className="text-sm text-loam-500">{t('common.loading')}</p>}
      {!loading && (!report || (!report.available && !report.supported)) && (
        <div className="rounded-lg border border-dashed border-loam-300 p-3">
          <p className="text-sm font-medium text-loam-700">{t('climate.forecast.soon')}</p>
          <p className="mt-0.5 text-xs text-loam-500">{t('climate.forecast.soon_hint')}</p>
        </div>
      )}
      {!loading && report && !report.available && report.supported && (
        <p className="rounded-lg bg-loam-50 p-3 text-sm text-loam-600">{t(`climate.reasons.${report.reason}`)}</p>
      )}
      {!loading && report?.available && (
        <>
          {report.alerts.map((alert) => (
            <div key={alert.kind} role="status" className={'flex gap-2 rounded-lg p-2.5 text-xs ' + (alert.kind === 'frost' ? 'bg-prune-50 text-prune-800' : 'bg-clay-50 text-clay-700')}>
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <div>
                {alert.kind === 'frost' ? (
                  <>
                    <p>{t('climate.forecast.frost_alert', { dates: formatDates(alert.dates), temp: formatTemp(alert.minC) })}</p>
                    {alert.plants.length > 0 && <p className="mt-0.5">{t('climate.forecast.frost_plants', { names: alert.plants.map((p) => p.name).join(', ') })}</p>}
                  </>
                ) : (
                  <p>{t('climate.forecast.heat_alert', { dates: formatDates(alert.dates), temp: formatTemp(alert.maxC) })}</p>
                )}
              </div>
            </div>
          ))}
          <ol className="-mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-1">
            {report.days.map((day) => {
              const kind = weatherKind(day.weatherCode)
              const Icon = ICONS[kind]
              return (
                <li key={day.date} className="w-14 shrink-0 snap-start rounded-lg bg-loam-50 px-1 py-1.5 text-center text-[11px]">
                  <p className="font-medium capitalize text-loam-700">{formatWeekday(day.date)}</p>
                  <Icon className="mx-auto my-1 h-5 w-5 text-loam-600" aria-label={t(`climate.forecast.weather.${kind}`)} />
                  <p className="font-semibold tabular-nums text-loam-900">{formatTemp(day.tmaxC).replace(' °C', '°')}</p>
                  <p className={'tabular-nums ' + ((day.tminC ?? 1) <= 0 ? 'font-semibold text-prune-700' : 'text-loam-500')}>{formatTemp(day.tminC).replace(' °C', '°')}</p>
                  {(day.precipMm ?? 0) > 0 && <p className="text-loam-500">{formatMm(day.precipMm)}</p>}
                </li>
              )
            })}
          </ol>
          {report.attribution && (
            <p className="text-[11px] text-loam-500">
              <a href={report.attribution.url} target="_blank" rel="noreferrer" className="hover:underline">
                {t('climate.forecast.attribution', { name: report.attribution.name, licence: report.attribution.licence })}
              </a>
            </p>
          )}
        </>
      )}
    </section>
  )
}
