import clsx from 'clsx'
import { ExternalLink, Sprout } from 'lucide-react'
import { gradeTone, Sparkline } from '@/components/eco/Sparkline'
import { PageHero, Section, SectionHeading } from '@/components/site/Section'
import { content, tf } from '@/lib/content'
import { formatNumber, t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import type { EcoScreen } from '@/types/eco'

type Props = { measurements: EcoScreen[] }
type Choice = { title: string; body: string }

const GRADE_CLASS = {
  leaf: 'bg-leaf-100 text-leaf-800 ring-leaf-300',
  humus: 'bg-humus-100 text-humus-800 ring-humus-300',
  clay: 'bg-clay-100 text-clay-800 ring-clay-500/40',
}

/** /ecoconception: what a page view of Terranova weighs, and what we do to lighten it. */
export default function Ecoconception({ measurements }: Props) {
  const choices = content<Choice[]>('site.ecoconception.choices.items')
  const next = content<string[]>('site.ecoconception.next.items')
  const columns = content<Record<string, string>>('site.ecoconception.measures.columns')
  const lastMeasured = measurements.map((row) => row.measuredAt).sort().pop()
  return (
    <>
      <PageHero eyebrow={tf('site.ecoconception.hero.eyebrow')} title={tf('site.ecoconception.hero.title')} lead={tf('site.ecoconception.hero.lead')} />

      <Section>
        <SectionHeading title={tf('site.ecoconception.measures.title')} intro={tf('site.ecoconception.measures.intro')} />
        {measurements.length === 0 ? (
          <p className="mt-8 rounded-2xl bg-white p-6 text-loam-600 ring-1 ring-loam-200">{tf('site.ecoconception.measures.empty')}</p>
        ) : (
          <>
            <div className="relative mt-8 overflow-x-auto rounded-2xl bg-white ring-1 ring-loam-200">
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-loam-50 text-loam-700">
                    <th scope="col" className="px-4 py-3 font-semibold">{columns.screen}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{columns.grade}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{columns.weight}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{columns.requests}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{columns.ges}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{columns.trend}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-loam-200 align-middle">
                  {measurements.map((row) => (
                    <tr key={row.screen}>
                      <th scope="row" className="px-4 py-3 font-normal">
                        <span className="block font-semibold text-loam-900">{t(`eco.screens.${row.screen}`)}</span>
                        <span className="text-loam-500">{t(`eco.environments.${row.environment}`)}</span>
                      </th>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span className={clsx('grid h-9 w-9 place-items-center rounded-full font-serif text-lg font-semibold ring-1', GRADE_CLASS[gradeTone(row.grade)])}>
                            {row.grade}
                          </span>
                          <span className="tabular-nums text-loam-500">{t('eco.score', { score: row.score })}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-loam-700">{t('eco.kilobytes', { value: formatNumber(row.kilobytes) })}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-loam-700">{formatNumber(row.requests)}</td>
                      <td className="px-4 py-3 text-loam-700">
                        <span className="block tabular-nums">{t('eco.ges', { value: formatNumber(row.gesGrams) })}</span>
                        <span className="block tabular-nums text-loam-500">{t('eco.water', { value: formatNumber(row.waterCentiliters) })}</span>
                      </td>
                      <td className="px-4 py-3 text-leaf-600">
                        <Sparkline scores={row.history} label={tf('site.ecoconception.measures.trend_label', { scores: row.history.join(', ') })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 max-w-3xl space-y-2 text-sm text-loam-500">
              {lastMeasured && <p>{tf('site.ecoconception.measures.measured_on', { date: formatDate(lastMeasured) })} {tf('site.ecoconception.measures.method')}</p>}
              {measurements.some((row) => row.screen === 'editor') && <p>{tf('site.ecoconception.measures.editor_note')}</p>}
              <a href={tf('site.ecoconception.measures.method_url')} className="inline-flex items-center gap-1.5 font-medium text-prune-700 hover:text-prune-800">
                {tf('site.ecoconception.measures.method_link')}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </>
        )}
      </Section>

      <Section tone="white">
        <SectionHeading title={tf('site.ecoconception.choices.title')} />
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {choices.map((choice) => (
            <li key={choice.title} className="flex gap-3">
              <Sprout className="mt-0.5 h-5 w-5 shrink-0 text-leaf-600" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-loam-900">{choice.title}</h3>
                <p className="mt-1 text-pretty leading-relaxed text-loam-600">{choice.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <SectionHeading title={tf('site.ecoconception.next.title')} />
        <ul className="mt-6 max-w-3xl list-disc space-y-2 pl-5 text-loam-600 marker:text-leaf-500">
          {next.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className="mt-8 max-w-3xl text-sm text-loam-500">{tf('site.ecoconception.rgesn')}</p>
      </Section>
    </>
  )
}
