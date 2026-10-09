import clsx from 'clsx'
import { Droplet, RefreshCw, Sprout, Sun } from 'lucide-react'
import { LngLatBounds } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SectionTitle } from '@/components/climate/CurrentClimate'
import { formatMm, formatTemp, formatWeekday } from '@/components/climate/format'
import { HelpButton } from '@/components/help/HelpButton'
import { api } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { visiblePadding } from '@/map/visiblePadding'
import { useWeatherStations, weatherStationsActions } from '@/map/weather_stations/store'
import type { WeatherDay, WeatherStation, WeatherStationsReport, WeatherSummary } from '@/types/weather_stations'

const NBSP = ' '
const km = (value: number) => `${formatNumber(value)}${NBSP}km`
const metres = (value: number) => `${formatNumber(Math.round(value))}${NBSP}m`
const shortDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d))
}

/**
 * « Stations météo proches », in the « Climat » panel: the official stations
 * around the terrain, and what the nearest one (or the one chosen on the
 * map) measured over the last days — a page of the field notebook rather
 * than a table. Hidden when the region has no stations or the map no place.
 */
export default function WeatherStationsSection() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { showOnMap, selectedCode, focusTick } = useWeatherStations()
  const [report, setReport] = useState<WeatherStationsReport | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  const load = useCallback((signal?: AbortSignal) => {
    setError(false)
    setLoading(true)
    const query = selectedCode != null ? `?station=${selectedCode}` : ''
    api<WeatherStationsReport>(`/maps/${mapId}/weather_stations${query}`, { signal })
      .then(setReport)
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(true) })
      .finally(() => setLoading(false))
  }, [mapId, selectedCode])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, editor.map.updatedAt])

  // A station clicked on the map: bring the section into view.
  useEffect(() => {
    if (focusTick > 0) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusTick])

  const toggleMap = (show: boolean) => {
    weatherStationsActions.setShowOnMap(show)
    if (!show || !report?.available) return
    // The stations are kilometres away: step back so the terrain and the nearest ones are in view.
    const bounds = new LngLatBounds()
    bounds.extend([report.location.lng, report.location.lat])
    report.stations.slice(0, 2).forEach((s) => bounds.extend([s.lng, s.lat]))
    editor.instance.fitBounds(bounds, { padding: visiblePadding(true, 70), maxZoom: 12, duration: 1200 })
  }

  if (error) {
    return (
      <section className="space-y-2">
        <SectionTitle>{t('weather_stations.title')}</SectionTitle>
        <p className="text-sm text-loam-600">{t('weather_stations.reasons.upstream_error')}</p>
        <Button variant="secondary" size="sm" onClick={() => load()}><RefreshCw className="h-4 w-4" />{t('weather_stations.retry')}</Button>
      </section>
    )
  }
  // No stations for this region, or no place yet: the panel says the rest.
  if (report && !report.available && (report.reason === 'not_configured' || report.reason === 'no_location')) return null

  return (
    <section ref={sectionRef} aria-labelledby="weather-stations-title" className="scroll-mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle id="weather-stations-title">{t('weather_stations.title')}</SectionTitle>
        <HelpButton slug="stations-meteo-proches" compact iconOnly className="-my-1 px-1.5 py-1" />
      </div>
      {!report && <p className="text-sm text-loam-500" aria-busy="true">{t('weather_stations.loading')}</p>}
      {report && !report.available && (
        <p className="rounded-lg bg-loam-50 p-3 text-sm text-loam-600">{t(`weather_stations.reasons.${report.reason}`)}</p>
      )}
      {report?.available && (
        <div className={clsx('space-y-3 transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
          <p className="text-xs text-loam-500">{t('weather_stations.intro')}</p>
          <Observed report={report} />
          <StationList stations={report.stations} shownCode={report.observed.station?.code ?? null} />
          <label className="flex items-center gap-2 text-xs text-loam-600">
            <input
              type="checkbox" checked={showOnMap} onChange={(e) => toggleMap(e.target.checked)}
              className="rounded border-loam-300 text-prune-600 focus:ring-prune-500"
            />
            {t('weather_stations.show_on_map')}
          </label>
          <p className="text-[11px] text-loam-500">
            <a href={report.attribution.url} target="_blank" rel="noreferrer" className="hover:underline">{t('weather_stations.attribution')}</a>
          </p>
        </div>
      )}
    </section>
  )
}

type AvailableReport = Extract<WeatherStationsReport, { available: true }>

function Observed({ report }: { report: AvailableReport }) {
  const observed = report.observed
  const station = observed.station
  const chosen = observed.chosen
  return (
    <div className="space-y-3 rounded-2xl border border-loam-200 bg-loam-50/60 p-3">
      {station && (
        <div>
          <p className="font-serif text-lg leading-tight text-loam-900">{t('weather_stations.observed.heading', { name: station.name })}</p>
          <p className="mt-0.5 text-xs text-loam-500">{stationFacts(station).join(' · ')}</p>
        </div>
      )}
      {chosen && station && chosen.code !== station.code && (
        <p className="text-xs text-loam-600">
          {t('weather_stations.observed.chosen_without_days', { chosen: chosen.name, station: station.name })}
        </p>
      )}
      {!observed.available && (
        <p className="text-sm text-loam-600">{t(`weather_stations.reasons.${observed.reason}`)}</p>
      )}
      {observed.available && observed.days.length === 0 && (
        <p className="text-sm text-loam-600">{t('weather_stations.observed.no_days')}</p>
      )}
      {observed.available && observed.days.length > 0 && station && (
        <>
          <DayStrip days={observed.days} stationName={station.name} />
          <Summary summary={observed.summary} />
          <SoilHint days={observed.days} />
        </>
      )}
    </div>
  )
}

/** "à 21,6 km de ton terrain · 288 m d'altitude, 120 m plus haut que ton terrain" */
function stationFacts(station: WeatherStation): string[] {
  const facts = [t('weather_stations.observed.where', { distance: km(station.distanceKm) })]
  if (station.altitudeM != null) {
    let altitude = t('weather_stations.observed.altitude', { altitude: metres(station.altitudeM) })
    const diff = station.altitudeDiffM
    if (diff != null) {
      const key = Math.abs(diff) < 10 ? 'altitude_diff_same' : diff > 0 ? 'altitude_diff_higher' : 'altitude_diff_lower'
      altitude += `, ${t(`weather_stations.observed.${key}`, { diff: metres(Math.abs(diff)) })}`
    }
    facts.push(altitude)
  }
  return facts
}

/**
 * Seven days side by side, like a weather log: each day a pencilled bar from
 * the night's minimum to the day's maximum on a shared scale, then the rain,
 * the sunshine and the soil.
 */
function DayStrip({ days, stationName }: { days: WeatherDay[]; stationName: string }) {
  const temps = days.flatMap((d) => [d.tminC, d.tmaxC]).filter((v): v is number => v != null)
  const lo = Math.min(0, ...temps) - 1
  const hi = Math.max(...temps, 1) + 1
  const pct = (value: number) => ((value - lo) / (hi - lo)) * 100
  const maxRain = Math.max(5, ...days.map((d) => d.precipMm ?? 0))
  const zero = pct(0)
  const row = 'flex h-4 items-center justify-center tabular-nums'
  return (
    <figure className="flex gap-1">
      <figcaption className="sr-only">{t('weather_stations.days.caption', { name: stationName })}</figcaption>
      {/* Row keys, aligned with the rows of each day. */}
      <div aria-hidden className="flex w-4 shrink-0 flex-col text-loam-400">
        <span className="h-[9.25rem]" />
        <span className={row} title={`${t('weather_stations.days.rain')} (mm)`}><Droplet className="h-3 w-3 text-pole-heroes/70" /></span>
        <span className={row} title={`${t('weather_stations.days.sun')} (h)`}><Sun className="h-3 w-3 text-humus-500" /></span>
        <span className={row} title={`${t('weather_stations.days.soil')} (10 cm)`}><Sprout className="h-3 w-3 text-lichen-600" /></span>
      </div>
      <ol className="grid min-w-0 flex-1 grid-cols-7 gap-0.5 text-center text-[11px]">
        {days.map((day) => {
          const [weekday, dayNumber] = formatWeekday(day.date).split(' ')
          return (
            <li
              key={day.date}
              aria-label={t('weather_stations.days.day_label', {
                date: formatWeekday(day.date), tmin: formatTemp(day.tminC), tmax: formatTemp(day.tmaxC),
                rain: formatMm(day.precipMm), sun: day.sunHours == null ? '—' : `${formatNumber(day.sunHours)} h`, soil: formatTemp(day.soilTemp10cmC),
              })}
              className="flex min-w-0 flex-col"
            >
              <span aria-hidden className={clsx(row, 'font-medium capitalize text-loam-700')}>{weekday}</span>
              <span aria-hidden className={clsx(row, 'text-loam-500')}>{dayNumber}</span>
              <span aria-hidden className={clsx(row, 'font-semibold text-loam-900')}>{deg(day.tmaxC)}</span>
              <span aria-hidden className="relative my-0.5 h-14">
                {zero > 0 && zero < 100 && <span className="absolute inset-x-1 border-t border-dashed border-prune-300" style={{ bottom: `${zero}%` }} />}
                {day.tminC != null && day.tmaxC != null && (
                  <span
                    className={clsx('absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-gradient-to-t', day.tminC <= 0 ? 'from-prune-500 to-humus-300' : 'from-leaf-300 to-humus-400')}
                    style={{ bottom: `${pct(day.tminC)}%`, height: `${Math.max(2, pct(day.tmaxC) - pct(day.tminC))}%` }}
                  />
                )}
              </span>
              <span aria-hidden className={clsx(row, (day.tminC ?? 1) <= 0 ? 'font-semibold text-prune-700' : 'text-loam-500')}>{deg(day.tminC)}</span>
              <span aria-hidden className="flex h-6 items-end justify-center">
                <span className="w-3 rounded-t-sm bg-pole-heroes/60" style={{ height: `${Math.min(100, ((day.precipMm ?? 0) / maxRain) * 100)}%` }} />
              </span>
              <span aria-hidden className={clsx(row, 'text-loam-600')}>{day.precipMm == null ? '—' : formatNumber(day.precipMm)}</span>
              <span aria-hidden className={clsx(row, 'text-humus-600')}>{day.sunHours == null ? '—' : formatNumber(day.sunHours)}</span>
              <span aria-hidden className={clsx(row, 'text-lichen-600')}>{deg(day.soilTemp10cmC)}</span>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}

const deg = (value: number | null) => (value == null ? '—' : formatTemp(value).replace(`${NBSP}°C`, '°'))

function Summary({ summary }: { summary: WeatherSummary }) {
  const partial = (days: number, full: number) => (days < full ? ` (${t('weather_stations.summary.partial', { count: days })})` : '')
  const rows: [string, string][] = [
    [t('weather_stations.summary.rain7'), formatMm(summary.rain7Mm) + partial(summary.days7, 7)],
    [t('weather_stations.summary.rain30'), formatMm(summary.rain30Mm) + partial(summary.days30, 30)],
    [
      t('weather_stations.summary.coldest_night'),
      summary.coldestNight
        ? t('weather_stations.summary.coldest_night_value', { temp: formatTemp(summary.coldestNight.tminC), date: shortDate(summary.coldestNight.date) })
        : '—',
    ],
    [t('weather_stations.summary.frost'), t(summary.frost7 ? 'weather_stations.summary.frost_yes' : 'weather_stations.summary.frost_no')],
  ]
  return (
    <div className="space-y-1">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-loam-500">{label}</dt>
            <dd className={clsx('font-medium tabular-nums', label === t('weather_stations.summary.frost') && summary.frost7 ? 'text-prune-700' : 'text-loam-900')}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-loam-500">{t('weather_stations.summary.frost_nights30', { count: summary.frostNights30 })}</p>
      {summary.lastDate && <p className="text-[11px] text-loam-500">{t('weather_stations.observed.last_date', { date: shortDate(summary.lastDate) })}</p>}
    </div>
  )
}

/** What the soil temperature means for roots, from the last day measured. */
function SoilHint({ days }: { days: WeatherDay[] }) {
  const soil = [...days].reverse().find((d) => d.soilTemp10cmC != null)?.soilTemp10cmC
  if (soil == null) return null
  const key = soil >= 8 ? 'warm' : soil >= 5 ? 'cool' : 'cold'
  return <p className="border-l-2 border-leaf-400 pl-2 text-xs text-loam-700">{t(`weather_stations.soil_hint.${key}`, { temp: formatTemp(soil) })}</p>
}

function StationList({ stations, shownCode }: { stations: WeatherStation[]; shownCode: number | null }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-loam-700">{t('weather_stations.list.title')}</h4>
      <ul className="mt-1 divide-y divide-loam-100">
        {stations.map((station) => {
          const shown = station.code === shownCode
          return (
            <li key={station.code} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate text-loam-900">
                  {station.name}
                  {station.nearest && <span className="ml-1.5 rounded bg-prune-100 px-1.5 py-0.5 align-middle text-[11px] text-prune-800">{t('weather_stations.list.nearest')}</span>}
                </p>
                <p className="text-xs text-loam-500">
                  {[
                    km(station.distanceKm),
                    station.altitudeM != null ? metres(station.altitudeM) : null,
                    t(station.daily ? 'weather_stations.list.daily' : 'weather_stations.list.synop'),
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              {station.daily && (
                shown
                  ? <span className="shrink-0 text-xs text-leaf-700">{t('weather_stations.list.shown')}</span>
                  : (
                    <button type="button" onClick={() => weatherStationsActions.select(station.code)} className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-prune-700 hover:bg-prune-50">
                      {t('weather_stations.list.show')}
                    </button>
                  )
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
