// « Cette semaine chez toi »: the server's WeekReport (`GET /maps/:id/week`)
// turned into what the map screen says, first the frost to protect against.
// Pure, so it is tested without a phone.
import { t } from './i18n'

export type ForecastDay = {
  date: string
  weatherCode: number | null
  tmaxC: number | null
  tminC: number | null
  precipMm: number | null
  precipProbabilityPct: number | null
  windGustsKmh: number | null
}

export type ForecastAlert =
  | { kind: 'frost'; dates: string[]; minC: number; plants: { name: string; coldLimitC: number }[] }
  | { kind: 'heat'; dates: string[]; maxC: number }

export type Forecast =
  | { available: false; reason: string; supported: boolean }
  | { available: true; supported: true; days: ForecastDay[]; alerts: ForecastAlert[]; attribution: { name: string; url: string; licence: string } | null; fetchedAt: string }

export type WeekReport = {
  today: string
  forecast: Forecast
  season: { month: number; title: string; body: string } | null
  plants: Record<'flowering' | 'harvest' | 'pruning', { names: string[]; count: number }>
  tasks: { id: number; title: string; dueOn: string; overdue: boolean; assignee: string | null }[]
}

export type Week = {
  frost: Extract<ForecastAlert, { kind: 'frost' }> | null
  heat: Extract<ForecastAlert, { kind: 'heat' }> | null
  /** The days still ahead (today included), at most seven. */
  days: ForecastDay[]
  attribution: string | null
  plants: { key: 'flowering' | 'harvest' | 'pruning'; names: string[]; more: number }[]
  tasks: WeekReport['tasks']
  /** Nothing to say beyond the season: the card stays quiet. */
  empty: boolean
}

const PLANT_KEYS = ['flowering', 'harvest', 'pruning'] as const

/** What the card shows; a frost already past is no longer an alert. */
export function weekOf(report: WeekReport, today = report.today): Week {
  const forecast = report.forecast
  const ahead = (dates: string[]) => dates.filter((d) => d >= today)
  let frost: Week['frost'] = null
  let heat: Week['heat'] = null
  let days: ForecastDay[] = []
  let attribution: string | null = null
  if (forecast.available) {
    days = forecast.days.filter((d) => d.date >= today).slice(0, 7)
    attribution = forecast.attribution ? `${forecast.attribution.name} (${forecast.attribution.licence})` : null
    for (const alert of forecast.alerts) {
      const dates = ahead(alert.dates)
      if (dates.length === 0) continue
      if (alert.kind === 'frost') {
        // The coldest night still ahead, from the days themselves when they say it.
        const nights = days.filter((d) => dates.includes(d.date) && d.tminC !== null).map((d) => d.tminC as number)
        const minC = nights.length > 0 ? Math.min(...nights) : alert.minC
        frost = { ...alert, dates, minC, plants: alert.plants.filter((p) => p.coldLimitC >= minC) }
      } else heat = { ...alert, dates }
    }
  }
  const plants = PLANT_KEYS.map((key) => ({ key, names: report.plants[key].names, more: report.plants[key].count - report.plants[key].names.length }))
    .filter((p) => p.names.length > 0)
  return { frost, heat, days, attribution, plants, tasks: report.tasks, empty: !frost && !heat && days.length === 0 && plants.length === 0 && report.tasks.length === 0 }
}

/** « −1,8 °C »: one decimal at most, French decimal comma, a real minus sign. */
export function formatTemp(celsius: number): string {
  const rounded = Math.round(celsius * 10) / 10
  return `${rounded < 0 ? '−' : ''}${String(Math.abs(rounded)).replace('.', ',')} °C`
}

/** « lun. », « mar. »… for a forecast day, read as a local date. */
export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-BE', { weekday: 'short' })
}

/** « jeudi et vendredi », « mardi, mercredi et jeudi ». */
export function dayList(dates: string[]): string {
  const names = dates.map((iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('fr-BE', { weekday: 'long' })
  })
  return names.length <= 1 ? names.join('') : t('mobile.week.and', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] })
}
