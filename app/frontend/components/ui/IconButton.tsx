import clsx from 'clsx'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Tone = 'neutral' | 'prune' | 'danger' | 'onDark'

const tones: Record<Tone, string> = {
  neutral: 'text-loam-500 hover:bg-loam-100 hover:text-loam-900',
  prune: 'text-prune-700 hover:bg-prune-50',
  danger: 'text-loam-500 hover:bg-clay-50 hover:text-clay-700',
  onDark: 'text-white/80 hover:bg-white/10 hover:text-white',
}

/**
 * A button that is only an icon. `label` is required: it is read by screen
 * readers and shown as the tooltip, so no icon stays a riddle.
 */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
  tone?: Tone
  size?: 'sm' | 'md'
  /** A toggle that is on (a shown layer, an open panel). */
  pressed?: boolean
}>(function IconButton({ label, children, tone = 'neutral', size = 'md', pressed, className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-200 active:scale-[0.96]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600 disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-8 w-8 [&_svg]:h-4 [&_svg]:w-4' : 'h-10 w-10 [&_svg]:h-5 [&_svg]:w-5',
        pressed ? 'bg-prune-50 text-prune-700' : tones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
