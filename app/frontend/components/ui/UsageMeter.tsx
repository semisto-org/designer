import clsx from 'clsx'
import { formatNumber, t } from '@/lib/i18n'

/**
 * How much of a plan's allowance is used: « 2 sur 3 cartes actives ». Leaf
 * while there is room, humus from 80 %, clay at the limit. `limit` null
 * means unlimited. `format` writes the values (sizes, for instance).
 */
export function UsageMeter({ label, used, limit, format = formatNumber, hint, className }: {
  label: string
  used: number
  limit: number | null
  format?: (value: number) => string
  hint?: string
  className?: string
}) {
  const ratio = limit ? Math.min(1, used / limit) : 0
  const level = limit === null ? 'free' : ratio >= 1 ? 'full' : ratio >= 0.8 ? 'near' : 'ok'
  return (
    <div className={clsx('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-loam-700">{label}</span>
        <span className={clsx('tabular-nums', level === 'full' ? 'font-semibold text-clay-700' : 'text-loam-600')}>
          {limit === null ? t('ui.usage.unlimited', { used: format(used) }) : t('ui.usage.of', { used: format(used), limit: format(limit) })}
        </span>
      </div>
      {limit !== null && (
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
          className="h-2 overflow-hidden rounded-full bg-loam-200"
        >
          <div
            className={clsx('h-full rounded-full transition-[width] duration-500', { free: 'bg-leaf-500', ok: 'bg-leaf-500', near: 'bg-humus-400', full: 'bg-clay-500' }[level])}
            style={{ width: `${Math.max(ratio * 100, used > 0 ? 3 : 0)}%` }}
          />
        </div>
      )}
      {hint && <p className="text-sm text-loam-500">{hint}</p>}
    </div>
  )
}
