import { Link } from '@inertiajs/react'
import { ArrowRight, Sprout } from 'lucide-react'
import clsx from 'clsx'
import { t } from '@/lib/i18n'
import type { OfferPrecision } from '@/types/offers'

type Props = {
  mapId: number
  precision: OfferPrecision
  /** In the map editor: shorter, and the map's own steps need no link. */
  compact?: boolean
}

const LEVEL_TONE: Record<OfferPrecision['level'], string> = {
  rough: 'text-humus-700',
  range: 'text-loam-800',
  precise: 'text-leaf-700',
}

/**
 * « Précision du budget »: a gauge made of one segment per fact the
 * calculation leans on, each as wide as its weight and filled as far as it
 * is known, then what to add next, the biggest gain first, with where to
 * add it. The budget grows more precise as the map and the sheet fill up.
 */
export function PrecisionCard({ mapId, precision, compact = false }: Props) {
  const byKey = Object.fromEntries(precision.checks.map((check) => [check.key, check]))
  const missing = precision.missing.slice(0, compact ? 3 : undefined)

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-loam-900">{t('offers.precision.title')}</h2>
        <span className={clsx('text-sm font-medium', LEVEL_TONE[precision.level])}>
          {t(`offers.precision.levels.${precision.level}`)} · {precision.score} %
        </span>
      </div>
      <div
        className="flex h-3 gap-0.5 overflow-hidden rounded-full"
        role="meter"
        aria-label={t('offers.precision.title')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={precision.score}
      >
        {precision.checks.map((check) => (
          <div key={check.key} className="relative h-full bg-loam-100" style={{ width: `${check.weight}%` }} title={t(`offers.precision.checks.${check.key}.label`)}>
            <div className="absolute inset-y-0 left-0 bg-leaf-500 transition-[width] duration-700 ease-out" style={{ width: `${check.done * 100}%` }} />
          </div>
        ))}
      </div>
      <p className="text-xs text-loam-600">{t(`offers.precision.explain.${precision.level}`)}</p>

      {missing.length > 0 ? (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-loam-500">{t('offers.precision.next')}</h3>
          <ul className="space-y-1.5">
            {missing.map((key) => {
              const check = byKey[key]
              const href = check.where === 'sheet' ? `/maps/${mapId}/project`
                : check.where === 'offer' ? (compact ? `/maps/${mapId}/offer#internal` : '#internal')
                  : compact ? null : `/maps/${mapId}`
              const gain = check.weight - check.points
              return (
                <li key={key} className="flex items-start gap-2 text-sm">
                  <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden />
                  <span className="min-w-0 flex-1 text-loam-700">
                    {t(`offers.precision.checks.${key}.hint`)}
                    {href && (
                      href.startsWith('#')
                        ? <a href={href} className="ml-1 inline-flex items-center gap-0.5 text-prune-700 underline-offset-2 hover:underline">{t(`offers.precision.where.${check.where}`)}<ArrowRight className="h-3 w-3" /></a>
                        : <Link href={href} className="ml-1 inline-flex items-center gap-0.5 text-prune-700 underline-offset-2 hover:underline">{t(`offers.precision.where.${check.where}`)}<ArrowRight className="h-3 w-3" /></Link>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-leaf-700">+{gain}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-leaf-700">{t('offers.precision.complete')}</p>
      )}
    </section>
  )
}
