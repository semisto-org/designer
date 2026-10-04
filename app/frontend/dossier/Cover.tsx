import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { formatDate } from '@/components/plants/format'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { LAYER_COLORS } from '@/map/layers/features'
import { renderPlan, scaleBar, type PlanImage } from '@/dossier/snapshot'
import type { Dossier, DossierSection } from '@/types/dossier'

// The plan's box on paper: 182 × 118 mm (A4 minus margins), at 96 px/inch.
const PLAN_WIDTH = 688
const PLAN_HEIGHT = 446

type PlanState = { status: 'rendering' } | { status: 'ready'; image: PlanImage } | { status: 'failed' } | { status: 'empty' }

/** First page: what the project is, where, by whom, and the plan. */
export function Cover({ dossier, cadastre, contents }: { dossier: Dossier; cadastre: boolean; contents: DossierSection[] }) {
  const { map, cover, plants } = dossier
  const plan = usePlan(cover, cadastre)
  const layers = [...new Set(cover.features.features.map((f) => f.properties.layer))]
  const facts: [string, string][] = [
    [t('dossier.cover.facts.area'), map.areaM2 != null ? formatArea(map.areaM2) : ''],
    [t('dossier.cover.facts.region'), map.region.name],
    [t('dossier.cover.facts.author'), map.ownerName],
    [t('dossier.cover.facts.date'), formatDate(dossier.generatedOn)],
    [t('dossier.cover.facts.stage'), t(`maps.stages.${map.stage}`)],
    [t('dossier.cover.facts.plants'), plants.total > 0 ? t('dossier.cover.plants_value', { total: formatNumber(plants.total), species: plants.speciesCount }) : ''],
  ]

  return (
    <section aria-label={t('dossier.sections.cover')} className="dossier-cover flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-prune-600">{t('dossier.cover.eyebrow')}</p>
        <Logo className="h-8 w-8" />
      </div>
      <h1 className="mt-4 text-3xl leading-tight text-loam-900 sm:text-4xl print:text-4xl">{map.name}</h1>
      {map.address && <p className="mt-1 text-base text-loam-600">{map.address}</p>}
      {map.description && <p className="mt-3 max-w-prose whitespace-pre-line text-sm text-loam-700">{map.description}</p>}

      <figure className="dossier-keep mt-6">
        <div className="relative overflow-hidden rounded-lg bg-loam-100 ring-1 ring-loam-200 print:rounded-none" style={{ aspectRatio: `${PLAN_WIDTH} / ${PLAN_HEIGHT}` }}>
          {plan.status === 'ready' ? (
            <>
              <img src={plan.image.url} alt={t('dossier.cover.plan_caption', { date: formatDate(dossier.generatedOn) })} className="absolute inset-0 h-full w-full object-cover" />
              <NorthArrow />
              <ScaleBar image={plan.image} />
            </>
          ) : (
            <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-loam-500">
              {t(plan.status === 'rendering' ? 'dossier.cover.plan_rendering' : plan.status === 'empty' ? 'dossier.cover.plan_empty' : 'dossier.cover.plan_failed')}
            </p>
          )}
        </div>
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-loam-600">
          <span className="font-medium text-loam-800">{t('dossier.cover.plan_caption', { date: formatDate(dossier.generatedOn) })}</span>
          {cover.boundary && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-5 border-t-2 border-dashed border-prune-600" aria-hidden />{t('dossier.cover.legend_boundary')}
            </span>
          )}
          {layers.map((layer) => (
            <span key={layer} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[layer] ?? '#6e6355' }} aria-hidden />
              {t(`editor.layers.${layer}`)}
            </span>
          ))}
        </figcaption>
      </figure>

      <dl className="dossier-keep mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-loam-200 pt-4 sm:grid-cols-3 print:grid-cols-3">
        {facts.filter(([, value]) => value).map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-wide text-loam-500">{label}</dt>
            <dd className="mt-0.5 font-medium text-loam-900">{value}</dd>
          </div>
        ))}
        {map.parcels.length > 0 && (
          <div className="col-span-2 sm:col-span-3 print:col-span-3">
            <dt className="text-[11px] uppercase tracking-wide text-loam-500">{t('dossier.cover.facts.parcels')}</dt>
            <dd className="mt-0.5 font-medium text-loam-900">{map.parcels.join(' · ')}</dd>
          </div>
        )}
      </dl>

      {contents.length > 0 && (
        <div className="dossier-keep mt-6">
          <p className="text-[11px] uppercase tracking-wide text-loam-500">{t('dossier.cover.contents')}</p>
          <ol className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 text-sm text-loam-700 sm:grid-cols-2 print:grid-cols-2">
            {contents.map((section, i) => (
              <li key={section}><span className="mr-1.5 tabular-nums text-prune-600">{i + 1}.</span>{t(`dossier.sections.${section}`)}</li>
            ))}
          </ol>
        </div>
      )}

      <p className="mt-auto pt-8 text-xs text-loam-500">{t('dossier.made_with')}</p>
    </section>
  )
}

function usePlan(cover: Dossier['cover'], cadastre: boolean): PlanState {
  const [state, setState] = useState<PlanState>({ status: cover.bbox ? 'rendering' : 'empty' })
  useEffect(() => {
    if (!cover.bbox) {
      setState({ status: 'empty' })
      return
    }
    let cancelled = false
    setState({ status: 'rendering' })
    renderPlan(cover, { width: PLAN_WIDTH, height: PLAN_HEIGHT, cadastre })
      .then((image) => !cancelled && setState(image ? { status: 'ready', image } : { status: 'empty' }))
      .catch((error) => {
        console.error(error)
        if (!cancelled) setState({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [cover, cadastre])
  return state
}

function NorthArrow() {
  return (
    <svg viewBox="0 0 32 40" className="absolute right-3 top-3 h-10 w-8 drop-shadow" aria-label={t('dossier.cover.north')} role="img">
      <circle cx="16" cy="22" r="13" fill="#ffffff" stroke="#1b1712" strokeWidth="1" />
      <path d="M16 11 L10 30 L16 26 Z" fill="#1b1712" />
      <path d="M16 11 L22 30 L16 26 Z" fill="#ffffff" stroke="#1b1712" strokeWidth="0.8" />
      <text x="16" y="8" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1b1712">{t('dossier.cover.north')}</text>
    </svg>
  )
}

function ScaleBar({ image }: { image: PlanImage }) {
  const { meters, percent } = scaleBar(image)
  return (
    <div className="absolute bottom-3 left-3 rounded bg-white/90 px-2 pb-1 pt-1.5 text-[10px] text-loam-900 shadow-sm" style={{ width: `calc(${percent}% + 1rem)` }}>
      <div className="flex h-1.5 border border-loam-900">
        <span className="flex-1 bg-loam-900" /><span className="flex-1" /><span className="flex-1 bg-loam-900" /><span className="flex-1" />
      </div>
      <div className="mt-0.5 flex justify-between tabular-nums"><span>0</span><span>{formatNumber(meters)} m</span></div>
    </div>
  )
}
