import clsx from 'clsx'
import { Check, Eye, MapPinned, PencilRuler, Sprout, type LucideIcon } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { JourneyItem, JourneyStep } from '@/types/journey'
import type { MapStage } from '@/types'

export const STEP_ICONS: Record<MapStage, LucideIcon> = {
  observe: Eye,
  map: MapPinned,
  design: PencilRuler,
  plant: Sprout,
}

export const stageLabel = (stage: MapStage) => t(`maps.stages.${stage}`)

/** Numbered circle of a step: check when complete, filled when current. */
export function StepBadge({ index, step, size = 'md' }: { index: number; step: JourneyStep; size?: 'sm' | 'md' }) {
  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full font-semibold',
        size === 'md' ? 'h-8 w-8 text-sm' : 'h-6 w-6 text-xs',
        step.done ? 'bg-leaf-500 text-white' : step.current ? 'bg-prune-600 text-white' : 'bg-loam-100 text-loam-600',
      )}
    >
      {step.done ? <Check className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden /> : index + 1}
    </span>
  )
}

/** "60 %" or "2 sur 3": how far an item is, when it is not all-or-nothing. */
export function itemProgressText(item: JourneyItem): string | null {
  if (item.done) return null
  if (item.progress != null) return t('journey.items.progress', { percent: item.progress })
  if (item.count != null && item.target != null && item.target > 1) return t('journey.items.count', { count: item.count, target: item.target })
  return null
}

export const itemLabel = (key: string) => t(`journey.items.${key}.label`)
export const itemHint = (item: JourneyItem) =>
  t(`journey.items.${item.key}.hint`, { target: item.target ?? 0 })
