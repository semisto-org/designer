import clsx from 'clsx'
import { useId, useRef, useState, type ReactNode } from 'react'

/**
 * A short explanation that appears on hover (after a breath) and on keyboard
 * focus. For a word or an icon whose meaning is not obvious; never for
 * something the person must read to go on.
 */
export function Tooltip({ content, children, side = 'top', className }: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const show = (delay: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), delay) }
  const hide = () => { window.clearTimeout(timer.current); setOpen(false) }
  return (
    <span
      className={clsx('relative inline-flex', className)}
      aria-describedby={open ? id : undefined}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(400) }}
      onPointerLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
      onKeyDown={(e) => { if (e.key === 'Escape') hide() }}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={clsx(
            'pointer-events-none absolute left-1/2 z-[80] w-max max-w-64 -translate-x-1/2 rounded-lg bg-loam-900 px-3 py-1.5 text-sm text-white shadow-lg',
            'animate-[notebook-in_180ms_ease-out] motion-reduce:animate-none',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
