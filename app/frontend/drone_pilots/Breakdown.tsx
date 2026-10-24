import { t } from '@/lib/i18n'
import { formatPrice } from '@/lib/money'
import type { DroneQuote } from '@/types/drone_pilots'

/** What the client will pay, and Semisto's share in it, said plainly. */
export function Breakdown({ quote }: { quote: DroneQuote }) {
  return (
    <dl className="space-y-1 rounded-xl bg-loam-50 px-4 py-3 text-sm">
      <div className="flex justify-between gap-2"><dt className="text-loam-600">{t('drone_pilots.quote.flat')}</dt><dd>{formatPrice(quote.priceCents)}</dd></div>
      {quote.travelCents > 0 && (
        <div className="flex justify-between gap-2"><dt className="text-loam-600">{t('drone_pilots.quote.travel', { km: quote.travelKm })}</dt><dd>{formatPrice(quote.travelCents)}</dd></div>
      )}
      <div className="flex justify-between gap-2 border-t border-loam-200 pt-1 font-semibold text-loam-900"><dt>{t('drone_pilots.quote.total')}</dt><dd>{formatPrice(quote.totalCents)}</dd></div>
      <p className="pt-1 text-loam-500">{t('drone_pilots.quote.share', { semisto: formatPrice(quote.semistoCents), pilot: formatPrice(quote.pilotShareCents) })}</p>
    </dl>
  )
}
