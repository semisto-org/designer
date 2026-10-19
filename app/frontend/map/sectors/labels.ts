import { t } from '@/lib/i18n'
import { compassPoint } from '@/map/sectors/sectors'

/** « de SE à S » */
export function rangeText(from: number, to: number) {
  return t('sectors.range', { from: compassPoint(from), to: compassPoint(to) })
}
