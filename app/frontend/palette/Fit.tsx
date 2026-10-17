import { t } from '@/lib/i18n'
import type { FitCriterion, FitCriterionKey, FitExclusion, PaletteSuggestions, PlantFit, SiteProfile } from '@/types/plants'

// Criterion → the catalogue vocabulary its values come from.
const FACET: Record<Exclude<FitCriterionKey, 'hardiness'>, string> = {
  exposure: 'exposures', moisture: 'soil_moisture', soil_type: 'soil_types', ph: 'soil_ph',
}

const MARK = { fits: '✓', partial: '~', misfit: '✗', unknown: '?' } as const

const TONE = {
  fits: 'bg-leaf-50 text-leaf-800 border-leaf-200',
  partial: 'bg-humus-50 text-humus-800 border-humus-200',
  misfit: 'bg-clay-50 text-clay-700 border-clay-200',
  unknown: 'bg-loam-50 text-loam-600 border-loam-200',
} as const

function siteValue(key: FitCriterionKey, value: string | number) {
  if (key === 'hardiness') return t('palette.fit.zone', { zone: value })
  return t(`plants.vocabulary.${FACET[key]}.${value}`).toLowerCase()
}

function criterionTitle(c: FitCriterion) {
  const site = c.site.map((v) => siteValue(c.key, v)).join(', ')
  let title = `${t(`palette.fit.criteria.${c.key}`)} (${site}) : ${t(`palette.fit.status.${c.status}`)}`
  if (c.status !== 'unknown' && !c.verified) title += `. ${t('palette.fit.unverified')}`
  return title
}

/**
 * The verdicts of one species, one chip per criterion the site can judge.
 * A verdict resting on a value nobody checked yet has a dashed outline.
 */
export function FitChips({ fit, excludedBy, className = 'mt-1' }: { fit: PlantFit; excludedBy?: FitExclusion | null; className?: string }) {
  // Hardiness already has its chip; invasiveness and toxicity have none.
  const flag = excludedBy === 'invasive' || excludedBy === 'toxic' ? excludedBy : null
  if (fit.criteria.length === 0 && !flag) return null
  return (
    <ul className={`flex flex-wrap gap-1 ${className}`} aria-label={t('palette.fit.label')}>
      {flag && <li className={`whitespace-nowrap rounded-full border px-1.5 text-sm ${TONE.misfit}`}><span aria-hidden>✗ </span>{t(`palette.fit.excluded_by.${flag}`)}</li>}
      {fit.criteria.map((c) => (
        <li
          key={c.key}
          title={criterionTitle(c)}
          className={`relative whitespace-nowrap rounded-full border px-1.5 text-sm ${TONE[c.status]} ${c.status !== 'unknown' && !c.verified ? 'border-dashed' : ''}`}
        >
          <span aria-hidden>{MARK[c.status]} </span>
          {t(`palette.fit.criteria.${c.key}`)}
          <span className="sr-only">: {t(`palette.fit.status.${c.status}`)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * What the suggestions know of this terrain and where it comes from, what
 * known facts left aside, and what to fill in for finer suggestions.
 */
export function SiteSummary({ data }: { data: Pick<PaletteSuggestions, 'site' | 'excluded'> }) {
  const signals = Object.entries(data.site.signals) as [FitCriterionKey, NonNullable<SiteProfile['signals'][FitCriterionKey]>][]
  const excluded = (['hardiness', 'invasive', 'toxic'] as const)
    .filter((key) => data.excluded[key] > 0)
    .map((key) => t(`palette.fit.excluded_${key}`, { count: data.excluded[key] }))
  const missing = !data.site.signals.exposure || !(data.site.signals.moisture || data.site.signals.soil_type || data.site.signals.ph)
  return (
    <div className="mb-2 space-y-1 text-sm text-loam-600">
      {signals.length > 0 && (
        <p>
          {t('palette.fit.site_intro')}{' '}
          {signals.map(([key, signal], i) => (
            <span key={key}>
              {i > 0 && ' · '}
              {signal.values.map((v) => siteValue(key, v)).join(', ')}
              <span className="text-loam-400"> ({t(`palette.fit.origins.${signal.origin}`)})</span>
            </span>
          ))}
        </p>
      )}
      {excluded.length > 0 && <p>{t('palette.fit.excluded', { list: excluded.join(', ') })}</p>}
      {missing && <p className="text-loam-500">{t('palette.fit.more')}</p>}
    </div>
  )
}
