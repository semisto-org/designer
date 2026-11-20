import clsx from 'clsx'
import { ExternalLink, Wind } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { ChipButton } from '@/components/ui/ChipButton'
import { formatNumber, t } from '@/lib/i18n'
import { COMPASS_POINTS } from '@/map/sectors/sectors'
import { WIND_CLASS_COLORS } from './colors'
import { WindRose } from './WindRose'
import { petalsOf, pointIndex, prevailingOf, type WindReport, type WindView } from './model'

/** « de l'ouest-sud-ouest », « du nord-est »: where a wind comes from, in words. */
export function windFrom(deg: number) {
  const name = t(`sectors.points.${COMPASS_POINTS[pointIndex(deg)].toLowerCase()}`)
  return /^[aeiouy]/i.test(name) ? `de l'${name}` : `du ${name}`
}

const fmt = (n: number, digits: number) => formatNumber(Number(n.toFixed(digits)))

const VIEWS: WindView[] = ['year', 'winter', 'spring', 'summer', 'autumn', 'cold_spring', 'strong']

/**
 * « Le vent de ta région »: the wind rose of a view (the year, a season, the
 * cold spring wind, the strongest hours), a sentence that reads it, and what
 * it cannot say: it is the region's wind (ERA5, ~31 km, no relief, no gusts).
 * The person's own measurements are drawn on it, and the card sends them
 * out to read the wind on their land.
 */
export function WindCard({ report, view, onView, actions, className }: {
  report: Extract<WindReport, { available: true }>
  view: WindView
  onView: (view: WindView) => void
  /** Buttons under the rose (« Ajouter ce vent comme secteur »). */
  actions?: ReactNode
  className?: string
}) {
  const titleId = useId()
  const roses = report.rose
  const measured = report.signs.flatMap((s) => (s.windFromDeg != null ? [s.windFromDeg] : []))
  return (
    <section aria-labelledby={titleId} className={clsx('space-y-2 rounded-xl bg-white p-3 ring-1 ring-loam-200', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={titleId} className="flex items-center gap-1.5 text-sm font-semibold text-loam-900">
          <Wind className="h-4 w-4 text-prune-600" aria-hidden />{t('wind.card.title')}
        </h3>
        <HelpButton slug="va-lire-le-vent" iconOnly compact />
      </div>
      {report.status === 'pending' && <p className="text-sm text-loam-600">{t('wind.card.pending')}</p>}
      {report.status === 'failed' && <p className="text-sm text-loam-600">{t('wind.card.failed')}</p>}
      {roses && (
        <>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('wind.card.views_label')}>
            {VIEWS.map((v) => (
              <ChipButton key={v} pressed={view === v} onClick={() => onView(v)}>{t(`wind.views.${v}`)}</ChipButton>
            ))}
          </div>
          <WindRose className="mx-auto block" petals={petalsOf(roses, view)} view={view} prevailing={prevailingOf(roses, view)} signs={measured} />
          <p className="text-sm text-loam-800" aria-live="polite">{reading(report, view)}</p>
          {view !== 'cold_spring' && view !== 'strong' && <Legend classes={roses.classesKmh} />}
          {actions}
        </>
      )}
      {/* What the model cannot see, and the way out: read it on the land. */}
      <p className="font-hand text-lg leading-snug text-prune-700">{t('wind.card.regional', { km: report.scale.windGridKm })}</p>
      {measured.length > 0
        ? <p className="text-sm text-loam-600">{t('wind.card.measured', { count: measured.length })}</p>
        : <p className="text-sm text-loam-600">{t('wind.card.go_read')}</p>}
      <p className="text-sm leading-snug text-loam-500">
        {t('wind.card.attribution', { first: report.period.firstYear, last: report.period.lastYear, year: report.source.year })}{' '}
        <a href={report.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-prune-700 hover:underline">
          {report.source.licence}<ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </p>
    </section>
  )
}

function reading(report: Extract<WindReport, { available: true }>, view: WindView): string {
  const roses = report.rose
  if (!roses) return ''
  if (view === 'cold_spring') {
    const cold = roses.coldSpring
    if (!cold || cold.prevailingDeg == null) return t('wind.reading.no_cold_spring')
    return t('wind.reading.cold_spring', { pct: fmt(cold.hoursPct, 1), from: windFrom(cold.prevailingDeg), cold: cold.coldC, north_east: fmt(cold.northEastPct, 0) })
  }
  if (view === 'strong') {
    const strong = roses.strong
    if (strong.prevailingDeg == null) return ''
    return t('wind.reading.strong', { from: windFrom(strong.prevailingDeg), kmh: fmt(strong.thresholdKmh, 0), max: fmt(strong.maxKmh, 0) })
  }
  const rose = view === 'year' ? roses.year : roses.seasons[view]
  if (!rose) return ''
  const top = rose.sectors.reduce((a, b) => (b.pct > a.pct ? b : a))
  return t(`wind.reading.${view === 'year' ? 'year' : 'season'}`, {
    when: view === 'year' ? '' : t(`wind.reading.when.${view}`), from: windFrom(rose.prevailingDeg), pct: fmt(top.pct, 0), kmh: fmt(rose.meanKmh, 0),
  })
}

function Legend({ classes }: { classes: number[] }) {
  const labels = [`< ${classes[0]}`, `${classes[0]}–${classes[1]}`, `${classes[1]}–${classes[2]}`, `≥ ${classes[2]}`]
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-loam-600" aria-label={t('wind.card.legend')}>
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-1">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: WIND_CLASS_COLORS[i] }} aria-hidden />
          {label} {t('wind.card.kmh')}
        </li>
      ))}
    </ul>
  )
}
