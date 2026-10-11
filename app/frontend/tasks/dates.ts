// Due dates of tasks: plain calendar days (« 2026-11-15 »), compared with
// the server's `today` so every viewer sees the same « en retard ». Pure
// helpers, no i18n (tested with node in test/frontend/tasks).

export type Day = string

export function parseDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day: Day, n: number): Day {
  const date = parseDay(day)
  date.setDate(date.getDate() + n)
  return toDay(date)
}

export function toDay(date: Date): Day {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const short = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' })
const withYear = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' })

export function formatDay(day: Day, today: Day): string {
  const date = parseDay(day)
  return date.getFullYear() === parseDay(today).getFullYear() ? short.format(date) : withYear.format(date)
}

export type DueTone = 'overdue' | 'soon' | 'later'

export type DueKind = 'overdue' | 'today' | 'tomorrow' | 'on'

/** What to say of a due date (the caller translates `kind`), and its tone. */
export function dueOf(due: Day, today: Day): { kind: DueKind; date: string; tone: DueTone } {
  const date = formatDay(due, today)
  if (due < today) return { kind: 'overdue', date, tone: 'overdue' }
  if (due === today) return { kind: 'today', date, tone: 'soon' }
  if (due === addDays(today, 1)) return { kind: 'tomorrow', date, tone: 'soon' }
  return { kind: 'on', date, tone: due <= addDays(today, 7) ? 'soon' : 'later' }
}

export type Bucket = 'overdue' | 'this_week' | 'later' | 'no_due'
export const BUCKETS: Bucket[] = ['overdue', 'this_week', 'later', 'no_due']

export function bucketOf(due: Day | undefined, today: Day): Bucket {
  if (!due) return 'no_due'
  if (due < today) return 'overdue'
  if (due <= addDays(today, 7)) return 'this_week'
  return 'later'
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

/** Meteorological seasons of the northern hemisphere (month 0 = January). */
export function seasonOf(month: number): Season {
  if (month === 11 || month <= 1) return 'winter'
  if (month <= 4) return 'spring'
  if (month <= 7) return 'summer'
  return 'autumn'
}

/** Bare-root planting, out of frost: November to March. */
export const isPlantingMonth = (month: number) => month >= 10 || month <= 2

/** The twelve months from today's, as « 2026-10 » keys. */
export function yearAhead(today: Day): { key: string; year: number; month: number }[] {
  const start = parseDay(today)
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1)
    return { key: monthKey(date.getFullYear(), date.getMonth()), year: date.getFullYear(), month: date.getMonth() }
  })
}

export const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`
export const monthOfDay = (day: Day) => day.slice(0, 7)

const monthName = new Intl.DateTimeFormat('fr-BE', { month: 'long' })
const monthShort = new Intl.DateTimeFormat('fr-BE', { month: 'short' })
export const formatMonth = (year: number, month: number) => monthName.format(new Date(year, month, 1))
export const formatMonthShort = (year: number, month: number) => monthShort.format(new Date(year, month, 1)).replace('.', '')
