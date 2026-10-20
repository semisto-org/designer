import clsx from 'clsx'
import type { ReactNode } from 'react'

const ARROWS = {
  // Drawn by hand, in the pencil of the notebook sketches.
  left: 'M30 6 C22 4 12 8 4 14 M4 14 L11 13 M4 14 L7 8',
  down: 'M8 2 C4 10 6 20 12 28 M12 28 L12 21 M12 28 L6 24',
  right: 'M2 14 C10 8 20 4 28 6 M28 6 L21 4 M28 6 L24 12',
} as const

/**
 * A note written by hand in the margin: the companion's voice. Short (a few
 * words), never the only place a piece of information lives.
 */
export function HandNote({ children, arrow, tone = 'prune', className }: {
  children: ReactNode
  arrow?: keyof typeof ARROWS
  tone?: 'prune' | 'leaf' | 'loam'
  className?: string
}) {
  const color = { prune: 'text-prune-700', leaf: 'text-leaf-700', loam: 'text-loam-500' }[tone]
  const svg = arrow && (
    <svg viewBox="0 0 32 30" className="h-6 w-7 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d={ARROWS[arrow]} />
    </svg>
  )
  return (
    <p className={clsx('inline-flex -rotate-1 items-center gap-1 font-hand text-xl leading-tight', color, className)}>
      {(arrow === 'left' || arrow === 'down') && svg}
      <span>{children}</span>
      {arrow === 'right' && svg}
    </p>
  )
}
