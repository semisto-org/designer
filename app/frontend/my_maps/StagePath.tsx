import clsx from 'clsx'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import type { MapStage } from '@/types'

const STAGES: MapStage[] = ['observe', 'map', 'design', 'plant']

/** Seed, sprout, sapling, tree: the four steps drawn as a plant that grows. */
const ICONS: Record<MapStage, ReactNode> = {
  observe: <><path d="M13 21c0-3 .2-5 0-7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /><ellipse cx="13" cy="19.5" rx="4.2" ry="3" fill="currentColor" /></>,
  map: <><path d="M13 22v-8" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /><path d="M13 15c-4 0-6-2.5-6-5 3 0 6 1.5 6 5zm0-1c0-3.5 2.5-5.5 6-5.5 0 3-2.5 5.5-6 5.5z" fill="currentColor" /></>,
  design: <><path d="M13 23V9" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" /><circle cx="13" cy="9" r="5.2" fill="currentColor" /><circle cx="9" cy="13" r="3.2" fill="currentColor" /><circle cx="17" cy="13" r="3.2" fill="currentColor" /></>,
  plant: <><path d="M13 24v-8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /><circle cx="13" cy="9" r="6.5" fill="currentColor" /><circle cx="7.5" cy="12.5" r="4.5" fill="currentColor" /><circle cx="18.5" cy="12.5" r="4.5" fill="currentColor" /></>,
}

export function StagePath({ stage, small = false }: { stage: MapStage; small?: boolean }) {
  const at = STAGES.indexOf(stage)
  return (
    <ol className="flex items-end" aria-label={t('my_maps.stage', { stage: t(`maps.stages.${stage}`) })}>
      {STAGES.map((key, i) => (
        <li
          key={key}
          aria-current={i === at ? 'step' : undefined}
          className={clsx(
            'relative flex w-1/4 flex-col items-center gap-0.5',
            i < at ? 'text-leaf-500' : i === at ? 'text-prune-600' : 'text-loam-200',
            // the dashed path between two steps
            i > 0 && 'before:absolute before:right-1/2 before:w-full before:border-t-[1.5px] before:border-dashed before:border-current before:opacity-70',
            i > 0 && (small ? 'before:bottom-[22px]' : 'before:bottom-[26px]'),
          )}
        >
          <svg viewBox="0 0 26 26" aria-hidden="true" className={clsx('relative z-10', small ? 'h-5 w-5' : 'h-[26px] w-[26px]')}>{ICONS[key]}</svg>
          <span className={clsx('whitespace-nowrap', small ? 'text-[10px]' : 'text-[11px]', i === at ? 'font-semibold text-prune-600' : i > at ? 'text-loam-300' : 'text-loam-500')}>
            {t(`maps.stages.${key}`)}
          </span>
        </li>
      ))}
    </ol>
  )
}
