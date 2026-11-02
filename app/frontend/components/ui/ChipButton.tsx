import clsx from 'clsx'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { PillTone } from './Pill'

const tones: Record<PillTone, string> = {
  neutral: 'bg-loam-50 text-loam-800 ring-1 ring-inset ring-loam-200 hover:bg-loam-100',
  prune: 'bg-prune-50 text-prune-800 hover:bg-prune-100',
  leaf: 'bg-leaf-50 text-leaf-800 hover:bg-leaf-100',
  humus: 'bg-humus-50 text-humus-800 hover:bg-humus-100',
  clay: 'bg-clay-50 text-clay-700 hover:bg-clay-100',
  lichen: 'bg-lichen-100 text-lichen-700 hover:bg-lichen-200',
}

/**
 * A small pill you can press: a place or an element named in a message
 * (« Voir l'endroit », « #Mare du bas »), a reaction, a filter. `inline`
 * sits inside a line of text, as a highlighted word.
 */
export const ChipButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: PillTone
  icon?: ReactNode
  inline?: boolean
  /** A toggle that is on (my applause). */
  pressed?: boolean
}>(function ChipButton({ tone = 'neutral', icon, inline, pressed, className, type = 'button', children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={clsx(
        'transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600 disabled:pointer-events-none disabled:opacity-50',
        inline
          ? 'rounded px-0.5 font-medium underline decoration-current/30 underline-offset-2'
          : 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm [&_svg]:h-4 [&_svg]:w-4',
        pressed ? 'bg-humus-100 text-humus-800' : tones[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})
