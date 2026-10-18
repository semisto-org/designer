import clsx from 'clsx'
import { t } from '@/lib/i18n'
import type { BillingInterval } from '@/types/billing'

const INTERVALS: BillingInterval[] = ['month', 'year']

/** « Au mois | À l'année » for the Pro and Team subscriptions. */
export function IntervalToggle({ value, onChange, className }: { value: BillingInterval; onChange: (interval: BillingInterval) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label={t('billing.interval.label')} className={clsx('inline-flex rounded-full bg-loam-100 p-1 text-sm', className)}>
      {INTERVALS.map((interval) => (
        <button
          key={interval}
          type="button"
          role="radio"
          aria-checked={value === interval}
          onClick={() => onChange(interval)}
          className={clsx(
            'rounded-full px-4 py-1.5 font-medium transition-colors',
            value === interval ? 'bg-white text-loam-900 shadow-sm' : 'text-loam-600 hover:text-loam-900',
          )}
        >
          {t(`billing.interval.${interval}`)}
        </button>
      ))}
    </div>
  )
}
