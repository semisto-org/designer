import clsx from 'clsx'
import type { ReactNode } from 'react'

export type PillTone = 'neutral' | 'prune' | 'leaf' | 'humus' | 'clay' | 'lichen'

const tones: Record<PillTone, string> = {
  neutral: 'bg-loam-100 text-loam-700',
  prune: 'bg-prune-50 text-prune-700',
  leaf: 'bg-leaf-50 text-leaf-700',
  humus: 'bg-humus-50 text-humus-700',
  clay: 'bg-clay-50 text-clay-700',
  lichen: 'bg-lichen-100 text-lichen-700',
}

/**
 * A short status or tag: « En projet », « Brouillon », « Pro ». leaf for what
 * is done or alive, humus for what needs attention, clay for what is wrong.
 */
export function Pill({ children, tone = 'neutral', icon, className }: {
  children: ReactNode
  tone?: PillTone
  icon?: ReactNode
  className?: string
}) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-medium [&_svg]:h-3.5 [&_svg]:w-3.5', tones[tone], className)}>
      {icon}
      {children}
    </span>
  )
}
