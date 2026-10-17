import { Apple, ChevronDown } from 'lucide-react'
import { ProvenanceBadge } from '@/components/plants/ProvenanceBadge'
import { formatDate } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import type { HarvestAdviceData, HarvestVariety } from '@/types/harvests'

const monthName = (month: number) => t(`plant_harvests.months.${month}`)

/** The suggestion, from how long the variety keeps (null when nothing is known). */
export function adviceText(advice: HarvestAdviceData): string | null {
  const v = advice.variety
  if (!v) return t('plant_harvests.advice.no_variety')
  if (!advice.keeping) return t('plant_harvests.advice.unknown')
  return t(`plant_harvests.advice.keeping.${advice.keeping}`, { until: v.eatingUntilMonth ? monthName(v.eatingUntilMonth) : '' })
}

/**
 * « Que faire de cette récolte ? » on a fruit plant's sheet: what its
 * variety is good for and how long it keeps, then what this place already
 * did with it. The catalogue gives a starting point; the notebook, season
 * after season, gives the place's own answer.
 */
export function AdviceCard({ advice }: { advice: HarvestAdviceData }) {
  const v = advice.variety
  const p = v?.provenance ?? {}
  const season = v && [
    v.pickingMonth ? t('plant_harvests.advice.picking', { month: monthName(v.pickingMonth) }) : null,
    v.eatingUntilMonth
      ? v.eatingFromMonth
        ? t('plant_harvests.advice.eating', { from: monthName(v.eatingFromMonth), until: monthName(v.eatingUntilMonth) })
        : t('plant_harvests.advice.eating_until', { until: monthName(v.eatingUntilMonth) })
      : null,
  ].filter(Boolean).join(' · ')
  const hereUses = Object.entries(advice.here.uses).map(([use, count]) => t('plant_harvests.advice.here_use', { use: t(`plant_harvests.uses.${use}`).toLowerCase(), count }))

  return (
    <div className="space-y-2 rounded-2xl bg-leaf-50 p-3 ring-1 ring-inset ring-leaf-200">
      <p className="flex items-center gap-1.5 font-serif text-base text-loam-900">
        <Apple className="h-4 w-4 text-leaf-700" aria-hidden />
        {t('plant_harvests.advice.title')}
      </p>
      {v && v.uses.length > 0 && (
        <p className="text-loam-800">
          {t('plant_harvests.advice.good_for', { uses: v.uses.map((u) => t(`plant_harvests.advice.variety_uses.${u}`)).join(', ') })}{' '}
          <ProvenanceBadge provenance={p.uses} />
        </p>
      )}
      {season && <p className="text-loam-700">{season} <ProvenanceBadge provenance={p.eatingUntilMonth ?? p.pickingMonth} /></p>}
      <p className="text-loam-800">{adviceText(advice)}</p>
      {advice.ripensInStore && v?.pickingMonth && v.eatingFromMonth && (
        <p className="text-loam-800">{t('plant_harvests.advice.ripens_in_store', { picking: monthName(v.pickingMonth), from: monthName(v.eatingFromMonth) })}</p>
      )}
      <p className="text-loam-600">{t('plant_harvests.advice.rule')}</p>
      <div className="space-y-1 border-t border-leaf-200 pt-2">
        <p className="font-medium text-loam-800">{t('plant_harvests.advice.here_title')}</p>
        {advice.here.picked === 0
          ? <p className="text-loam-600">{t('plant_harvests.advice.here_none')}</p>
          : hereUses.length > 0 && <p className="text-loam-700">{t('plant_harvests.advice.here_uses', { uses: hereUses.join(', ') })}</p>}
        {advice.here.notes.map((n, i) => (
          <p key={i} className="text-loam-700">
            « {n.note} » <span className="text-loam-500">— {[n.plant, formatDate(n.notedOn)].filter(Boolean).join(', ')}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

const KEEPING_GROUPS = ['keeps', 'weeks', 'short', 'unknown'] as const

/**
 * « Que faire de chaque variété ? » in the panel: the varieties of the map
 * by how long they keep (cellar, a few weeks, at once), each with what it
 * is good for and what this place already did with it.
 */
export function VarietiesGuide({ varieties }: { varieties: HarvestVariety[] }) {
  if (varieties.length === 0) return null
  const groups = KEEPING_GROUPS.map((key) => ({ key, rows: varieties.filter((v) => (v.keeping ?? 'unknown') === key) })).filter((g) => g.rows.length > 0)
  return (
    <details className="group rounded-2xl bg-leaf-50 p-3 ring-1 ring-inset ring-leaf-200">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-serif text-base text-loam-900">
        <Apple className="h-4 w-4 text-leaf-700" aria-hidden />
        {t('plant_harvests.varieties.title')}
        <ChevronDown className="ml-auto h-4 w-4 text-loam-500 transition group-open:rotate-180" aria-hidden />
      </summary>
      <p className="mt-2 text-loam-600">{t('plant_harvests.varieties.intro')}</p>
      <div className="mt-2 space-y-3">
        {groups.map((group) => (
          <section key={group.key}>
            <h3 className="mb-1 text-sm font-semibold text-loam-700">{t(`plant_harvests.varieties.groups.${group.key}`)}</h3>
            <ul className="divide-y divide-leaf-100">
              {group.rows.map((v) => {
                const here = Object.entries(v.here).map(([use, count]) => t('plant_harvests.advice.here_use', { use: t(`plant_harvests.uses.${use}`).toLowerCase(), count }))
                return (
                  <li key={v.id} className="py-1.5">
                    <p className="text-loam-800">
                      <span className="font-medium">{v.name}</span>
                      <span className="text-loam-500"> · {[v.speciesName, t('plant_harvests.varieties.plants', { count: v.plants })].filter(Boolean).join(', ')}</span>
                    </p>
                    {(v.uses.length > 0 || v.eatingUntilMonth) && (
                      <p className="text-loam-700">
                        {[v.uses.map((u) => t(`plant_harvests.advice.variety_uses.${u}`)).join(', '), v.eatingUntilMonth ? t('plant_harvests.varieties.until', { month: monthName(v.eatingUntilMonth) }) : null].filter(Boolean).join(' · ')}{' '}
                        <ProvenanceBadge provenance={v.provenance.uses ?? v.provenance.eatingUntilMonth} />
                      </p>
                    )}
                    {here.length > 0 && <p className="text-loam-600">{t('plant_harvests.varieties.here', { uses: here.join(', ') })}</p>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}
