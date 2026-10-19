import clsx from 'clsx'
import type { ReactNode } from 'react'

type Props = {
  label: string
  /** What is used, as written (« 2 », « 1,2 Go »). */
  value: string
  /** The plan's limit as written, or null when there is none. */
  limit: string | null
  /** 0 to 1, or null when there is no limit. */
  ratio: number | null
  /** Under the bar: when it resets, what « unlimited » means… */
  hint?: ReactNode
}

/**
 * One allowance of a plan, read at a glance: a hand-drawn bar that turns
 * mango near the limit and pomegranate when it is reached.
 */
export function UsageMeter({ label, value, limit, ratio, hint }: Props) {
  const filled = ratio === null ? 0 : Math.min(1, Math.max(0, ratio))
  const tone = ratio !== null && ratio >= 1 ? 'bg-clay-500' : ratio !== null && ratio >= 0.8 ? 'bg-humus-500' : 'bg-leaf-500'
  return (
    <div className="min-w-0">
      <p className="text-sm text-loam-600">{label}</p>
      <p className="mt-0.5 font-serif text-2xl leading-tight text-loam-900">
        <span className="tabular-nums">{value}</span>
        {limit && <span className="text-base text-loam-500"> / {limit}</span>}
      </p>
      {ratio !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-loam-100" role="presentation">
          <div className={clsx('h-full rounded-full transition-[width] duration-700', tone)} style={{ width: `${Math.max(filled * 100, filled > 0 ? 4 : 0)}%` }} />
        </div>
      )}
      {hint && <p className="mt-1.5 text-sm text-loam-500">{hint}</p>}
    </div>
  )
}
