import { t } from '@/lib/i18n'
import type { AerialView } from '@/types/drone'

// A flight date is a calendar day: read it as such wherever the reader is.
const longDay = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long', timeZone: 'UTC' })

/** "12 mai 2027" */
export function formatCaptureDate(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? isoDate : longDay.format(date)
}

/** "Vue drone · 12 mai 2027" */
export function aerialViewLabel(view: Pick<AerialView, 'name' | 'capturedOn'>): string {
  return t('drone.view_label', { name: view.name, date: formatCaptureDate(view.capturedOn) })
}
