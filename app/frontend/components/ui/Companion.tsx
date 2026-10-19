import clsx from 'clsx'
import type { ReactNode } from 'react'
import { HandNote } from './HandNote'

/** A seedling in pencil: the thing that will grow here. */
function Seedling() {
  return (
    <svg viewBox="0 0 64 64" className="mx-auto h-14 w-14 text-leaf-600" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M32 56 C32 44 31 36 32 26" />
      <path d="M32 34 C24 34 17 29 15 20 C24 20 30 25 32 34 Z" className="fill-leaf-100" />
      <path d="M32 27 C38 26 45 20 47 12 C38 13 33 19 32 27 Z" className="fill-leaf-100" />
      <path d="M18 57 C26 55 38 55 46 57" className="text-loam-400" />
    </svg>
  )
}

/**
 * An empty screen as a companion moment: what to look at first, and why.
 * `title` names the next step, `why` gives its reason in a sentence, `note`
 * is the handwritten nudge in the margin.
 */
export function CompanionEmpty({ title, why, note, action, illustration, className }: {
  title: ReactNode
  why?: ReactNode
  note?: string
  action?: ReactNode
  /** Replaces the seedling (a watercolour, a sketch of the place). */
  illustration?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('rounded-2xl border border-dashed border-loam-300 bg-loam-50/70 px-6 py-10 text-center', className)}>
      {illustration ?? <Seedling />}
      <h3 className="mt-3 font-serif text-xl font-semibold text-prune-800">{title}</h3>
      {why && <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-loam-600">{why}</div>}
      {action && <div className="mt-5">{action}</div>}
      {note && <HandNote className="mt-4" arrow={action ? undefined : 'down'}>{note}</HandNote>}
    </div>
  )
}
