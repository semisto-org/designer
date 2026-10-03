import { Lock } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { t } from '@/lib/i18n'

/** What the free plan does not include, and where to get it. */
export function Upsell({ plantsCount }: { plantsCount: number }) {
  return (
    <section className="rounded-xl bg-prune-50 p-3.5 ring-1 ring-inset ring-prune-100">
      <p className="flex items-center gap-2 text-sm font-semibold text-prune-800">
        <Lock className="h-4 w-4" aria-hidden />
        {t('climate.locked.title')}
      </p>
      <p className="mt-1.5 text-sm text-prune-900/80">{t('climate.locked.body')}</p>
      {plantsCount > 0 && <p className="mt-1.5 text-sm text-prune-900/80">{t('climate.locked.plants_count', { count: plantsCount })}</p>}
      <p className="mt-1.5 text-xs text-prune-700">{t('climate.locked.included')}</p>
      <ButtonLink href="/billing" size="sm" className="mt-3">{t('climate.locked.cta')}</ButtonLink>
    </section>
  )
}
