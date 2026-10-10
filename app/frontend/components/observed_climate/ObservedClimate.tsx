import { ExternalLink, Sprout } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SectionTitle } from '@/components/climate/CurrentClimate'
import { formatDelta, formatMm, formatMonthDay, formatTemp } from '@/components/climate/format'
import { ZoneBadge } from '@/components/climate/ZoneBadge'
import { HelpButton } from '@/components/help/HelpButton'
import { api } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { FrostWindow } from './FrostWindow'
import { MonthlyChart } from './MonthlyChart'
import { frostIsRare, wettestAndDriest, type ObservedClimateData, type ObservedClimateReport } from './model'

const POLL_MS = 15_000
const monthName = new Intl.DateTimeFormat('fr-BE', { month: 'long', timeZone: 'UTC' })

/**
 * « Le climat observé ici (1995–2024) »: thirty years of ERA5-Land at the
 * map's grid cell, computed on the server the first time (minutes) and
 * polled meanwhile. Renders nothing while the source is not configured.
 */
export function ObservedClimate({ mapId, version }: { mapId: number | string; version?: string | null }) {
  const [report, setReport] = useState<ObservedClimateReport | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      api<ObservedClimateReport>(`/maps/${mapId}/observed_climate`, { signal: controller.signal })
        .then((next) => {
          setError(false)
          setReport(next)
          if (next.available && next.status === 'pending') timer = setTimeout(load, POLL_MS)
        })
        .catch((e: Error) => { if (e.name !== 'AbortError') setError(true) })
    }
    load()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [mapId, version])

  if (error) return <p className="text-xs text-loam-500">{t('observed_climate.load_error')}</p>
  if (!report || !report.available) return null

  const title = t('observed_climate.title', { first: report.period.firstYear, last: report.period.lastYear })
  return (
    <section aria-labelledby="climate-observed" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle id="climate-observed">{title}</SectionTitle>
        <HelpButton compact slug="le-climat-observe" />
      </div>
      {report.status === 'pending' && <Pending />}
      {report.status === 'failed' && <p className="text-sm text-loam-600">{t('observed_climate.failed')}</p>}
      {report.status === 'ready' && report.data && <Observed data={report.data} />}
      {report.status === 'ready' && <p className="text-[11px] text-loam-500">{t('observed_climate.grid_note', { km: report.gridKm })}</p>}
      <Attribution source={report.source} />
    </section>
  )
}

function Pending() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-loam-50 px-3 py-2.5 text-sm text-loam-700" aria-live="polite">
      <Sprout className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-leaf-600" aria-hidden />
      <p>{t('observed_climate.pending')}</p>
    </div>
  )
}

function Observed({ data }: { data: ObservedClimateData }) {
  const { frost, annual } = data
  const extremes = wettestAndDriest(data.months)
  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-700">{t('observed_climate.intro')}</p>

      <div className="space-y-2">
        <h4 className="font-serif text-base text-loam-900">{t('observed_climate.frost.title')}</h4>
        <FrostWindow frost={frost} />
        <p className="text-sm text-loam-800">{springSentence(data)}</p>
        <p className="text-sm text-loam-800">{autumnSentence(data)}</p>
        {frost.frostFreeDays != null && <p className="text-sm text-loam-800">{t('observed_climate.frost.season', { days: frost.frostFreeDays })}</p>}
      </div>

      <div className="space-y-2">
        <h4 className="font-serif text-base text-loam-900">{t('observed_climate.months.title')}</h4>
        <MonthlyChart months={data.months} />
        {extremes && annual.rainMm != null && (
          <p className="text-sm text-loam-800">
            {t('observed_climate.months.rain', {
              rain: formatMm(annual.rainMm),
              wettest: monthName.format(Date.UTC(2001, extremes.wettest, 1)),
              driest: monthName.format(Date.UTC(2001, extremes.driest, 1)),
            })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="font-serif text-base text-loam-900">{t('observed_climate.year.title')}</h4>
        {data.zone && annual.annualMinC != null && (
          <div className="flex items-center gap-3">
            <ZoneBadge code={data.zone.code} />
            <p className="text-sm text-loam-800">
              {t('observed_climate.year.cold', { temp: formatTemp(annual.annualMinC), coldest: formatTemp(annual.coldestC), zone: data.zone.code })}
            </p>
          </div>
        )}
        <ul className="space-y-1 text-sm text-loam-800">
          {annual.meanTempC != null && <li>{t('observed_climate.year.mean', { temp: formatTemp(annual.meanTempC) })}</li>}
          {annual.gddBase10 != null && <li>{t('observed_climate.year.warmth', { gdd: formatNumber(annual.gddBase10) })}</li>}
          {annual.hotDays != null && <li>{t('observed_climate.year.hot', { count: Math.round(annual.hotDays) })}</li>}
        </ul>
      </div>

      <Trend data={data} />
    </div>
  )
}

function springSentence({ frost, years }: ObservedClimateData): string {
  const { mean, late, yearsWith } = frost.lastSpring
  if (yearsWith === 0 || !mean) return t('observed_climate.frost.spring_none', { years })
  if (frostIsRare(yearsWith, years)) return t('observed_climate.frost.spring_rare', { count: yearsWith, years })
  return t('observed_climate.frost.spring', { mean: formatMonthDay(mean), late: formatMonthDay(late) })
}

function autumnSentence({ frost, years }: ObservedClimateData): string {
  const { mean, early, yearsWith } = frost.firstAutumn
  if (yearsWith === 0 || !mean) return t('observed_climate.frost.autumn_none', { years })
  if (frostIsRare(yearsWith, years)) return t('observed_climate.frost.autumn_rare', { count: yearsWith, years })
  return t('observed_climate.frost.autumn', { mean: formatMonthDay(mean), early: formatMonthDay(early) })
}

/** What already changed between the first and the last decade. */
function Trend({ data }: { data: ObservedClimateData }) {
  const trend = data.trend
  if (!trend) return null
  const d = trend.delta
  const items: string[] = []
  if (d.meanTempC != null) items.push(t('observed_climate.trend.temp', { delta: formatDelta(d.meanTempC) }))
  if (d.lastSpringFrostDoy) {
    items.push(t(`observed_climate.trend.${d.lastSpringFrostDoy < 0 ? 'spring_earlier' : 'spring_later'}`, { days: Math.abs(d.lastSpringFrostDoy) }))
  }
  if (d.firstAutumnFrostDoy) {
    items.push(t(`observed_climate.trend.${d.firstAutumnFrostDoy > 0 ? 'autumn_later' : 'autumn_earlier'}`, { days: Math.abs(d.firstAutumnFrostDoy) }))
  }
  if (d.hotDays) items.push(t('observed_climate.trend.hot', { delta: formatDelta(d.hotDays, 'j') }))
  if (d.rainMm) items.push(t('observed_climate.trend.rain', { delta: formatDelta(d.rainMm, 'mm') }))
  if (d.gddBase10) items.push(t('observed_climate.trend.gdd', { delta: formatDelta(d.gddBase10, '').trim() }))
  if (items.length === 0) return null

  return (
    <div className="space-y-1.5">
      <h4 className="font-serif text-base text-loam-900">{t('observed_climate.trend.title')}</h4>
      <p className="text-sm text-loam-700">
        {t('observed_climate.trend.intro', { first: `${trend.first.from}–${trend.first.to}`, last: `${trend.last.from}–${trend.last.to}` })}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className="rounded-full bg-humus-50 px-2.5 py-1 text-xs text-humus-800 ring-1 ring-inset ring-humus-200">{item}</li>
        ))}
      </ul>
    </div>
  )
}

function Attribution({ source }: { source: Extract<ObservedClimateReport, { available: true }>['source'] }) {
  return (
    <p className="text-[11px] leading-snug text-loam-500">
      {t('observed_climate.attribution', { year: source.year })}{' '}
      <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-prune-700 hover:underline">
        {t('observed_climate.dataset', { licence: source.licence })}
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </p>
  )
}
