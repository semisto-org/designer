import clsx from 'clsx'
import { t } from '@/lib/i18n'
import type { SoilIndicatorKey } from '@/types/soil_photos'

export const indicatorLabel = (key: SoilIndicatorKey) => t(`soil.indicators.${key}.label`)

/** Indicator chips: the words, never just a colour. */
export function IndicatorChips({ keys, unverified = [], className }: { keys: SoilIndicatorKey[]; unverified?: SoilIndicatorKey[]; className?: string }) {
  if (keys.length === 0) return null
  return (
    <span className={clsx('flex flex-wrap gap-1', className)}>
      {keys.map((key) => {
        const doubtful = unverified.includes(key)
        return (
          <span
            key={key}
            title={doubtful ? `${t(`soil.indicators.${key}.hint`)} ${t('soil.plants.unverified_hint')}` : t(`soil.indicators.${key}.hint`)}
            className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', doubtful ? 'border border-dashed border-lichen-400 text-lichen-700' : 'bg-lichen-100 text-lichen-700')}
          >
            {indicatorLabel(key)}{doubtful && ` ${t('soil.plants.unverified')}`}
          </span>
        )
      })}
    </span>
  )
}
