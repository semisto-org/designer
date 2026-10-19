import { t } from '@/lib/i18n'
import { allAround, compassPoint } from '@/map/sectors/sectors'

/** « de SE à S », or « tout autour ». */
export function rangeText(from: number, to: number) {
  if (allAround(from, to)) return t('sectors.all_around')
  return t('sectors.range', { from: compassPoint(from), to: compassPoint(to) })
}
