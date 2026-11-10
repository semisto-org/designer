import { formatNumber, t } from '@/lib/i18n'

/** 150 → « 2 h 30 », 45 → « 45 min », 120 → « 2 h ». */
export function formatDuration(minutes: number): string {
  const whole = Math.round(minutes)
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (whole === 0) return t('time_entries.duration.hours', { hours: 0 })
  if (hours === 0) return t('time_entries.duration.minutes', { minutes: rest })
  if (rest === 0) return t('time_entries.duration.hours', { hours })
  return t('time_entries.duration.hours_minutes', { hours, minutes: String(rest).padStart(2, '0') })
}

export const formatHours = (hours: number) => formatDuration(hours * 60)
export const formatKm = (km: number) => formatNumber(km)

const dayFormat = new Intl.DateTimeFormat('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
const dateFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
const shortFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' })
const monthFormat = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`)
export const formatDay = (iso: string) => dayFormat.format(parse(iso))
export const formatDate = (iso: string) => dateFormat.format(parse(iso))
export const formatShortDate = (iso: string) => shortFormat.format(parse(iso))
export const formatMonth = (month: string) => monthFormat.format(parse(`${month}-01`))

/** « 2,5 » or « 2h30 » or « 2:30 » → minutes, rounded to the step; null when unreadable. */
export function parseDuration(text: string, step = 15): number | null {
  const value = text.trim().toLowerCase().replace(',', '.')
  if (!value) return null
  const clock = value.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{1,2})?\s*(?:min)?$/)
  const minutesOnly = value.match(/^(\d{1,3})\s*min$/)
  let minutes: number | null = null
  if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2] ?? 0)
  else if (minutesOnly) minutes = Number(minutesOnly[1])
  else if (/^\d+(\.\d+)?$/.test(value)) minutes = Number(value) * 60
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  return Math.max(step, Math.round(minutes / step) * step)
}

/** 150 → « 2,5 », for the duration field. */
const inputFormat = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2, useGrouping: false })
export const durationInput = (minutes: number) => inputFormat.format(minutes / 60)

export function statementHref(billTo: string | null, from?: string | null, to?: string | null) {
  const params = new URLSearchParams()
  if (billTo) params.set('bill_to', billTo)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return `/time_entries/statement?${params.toString()}`
}

const euroFormat = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' })
const euroRound = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
/** 125050 → « 1 250,50 € »; `round` drops the cents for totals. */
export const formatEuros = (cents: number, round = false) => (round ? euroRound : euroFormat).format(cents / 100)
/** 1250 → « 12,5 », for the amount field. */
export const amountInput = (cents: number) => new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2, useGrouping: false }).format(cents / 100)
/** « 12,50 » → 1250; null when unreadable. */
export function parseAmount(text: string): number | null {
  const value = text.trim().replace(/\s/g, '').replace(',', '.').replace('€', '')
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  const cents = Math.round(Number(value) * 100)
  return cents > 0 ? cents : null
}
