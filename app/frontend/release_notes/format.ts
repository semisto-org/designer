import { t } from '@/lib/i18n'
import type { ReleaseNoteLiker } from '@/types/releaseNotes'

/** A YYYY-MM-DD day at noon, so no time zone moves it to the day before. */
export const parseDay = (day: string) => new Date(`${day}T12:00:00`)

const dayFormat = new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
const longDayFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })

/** « jeudi 9 octobre », as written at the top of a notebook page. */
export const formatDay = (day: string) => dayFormat.format(parseDay(day))
export const formatLongDay = (day: string) => longDayFormat.format(parseDay(day))
export const formatMonth = (day: string) => monthFormat.format(parseDay(day))
export const monthKey = (day: string) => day.slice(0, 7)

/** Meteorological seasons: winter is December to February. */
export function seasonOf(day: string): 'winter' | 'spring' | 'summer' | 'autumn' {
  const month = parseDay(day).getMonth() + 1
  if (month === 12 || month <= 2) return 'winter'
  if (month <= 5) return 'spring'
  if (month <= 8) return 'summer'
  return 'autumn'
}

/**
 * « Aimé par toi, Alice et 3 autres »: the viewer first, then the others in
 * the order they liked, two names at most.
 */
export function likersSummary(likes: ReleaseNoteLiker[], count: number, liked: boolean, viewerId: number | undefined): string {
  if (count === 0) return t('release_notes.like.none')
  const others = likes.filter((liker) => liker.id !== viewerId).map((liker) => firstName(liker.name))
  const names = [...(liked ? [t('release_notes.like.you')] : []), ...others].slice(0, 2)
  if (names.length === 0) return t('release_notes.like.by', { names: t('release_notes.like.people', { count }) })
  const rest = count - names.length
  const list = rest > 0
    ? t('release_notes.like.and_others', { names: names.join(', '), count: rest })
    : names.length === 2 ? t('release_notes.like.and', { first: names[0], last: names[1] }) : names[0]
  return t('release_notes.like.by', { names: list })
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name
