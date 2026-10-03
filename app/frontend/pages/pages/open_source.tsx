import { Code2, ExternalLink, Heart } from 'lucide-react'
import { PageHero, Section, SectionHeading } from '@/components/site/Section'
import { content, tf } from '@/lib/content'

type DataRow = { source: string; use: string; licence: string }

const linkClass = 'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors'

export default function OpenSource() {
  const licence = content<{ body: string[]; cta: string; url: string }>('site.open_source.licence')
  const columns = content<Record<string, string>>('site.open_source.data.columns')
  const rows = content<DataRow[]>('site.open_source.data.rows')
  const contribute = content<{ cta: string; url: string }>('site.open_source.contribute')
  return (
    <>
      <PageHero eyebrow={tf('site.open_source.hero.eyebrow')} title={tf('site.open_source.hero.title')} lead={tf('site.open_source.hero.lead')} />

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-prune-100 text-prune-700"><Code2 className="h-6 w-6" aria-hidden="true" /></span>
            <h2 className="mt-4 text-2xl">{tf('site.open_source.licence.title')}</h2>
            <div className="mt-3 space-y-3 text-pretty leading-relaxed text-loam-600">
              {licence.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <a href={licence.url} className={`${linkClass} mt-6 bg-prune-600 text-white hover:bg-prune-700`}>
              {licence.cta}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <div className="space-y-8">
            <div>
              <h2 className="text-xl">{tf('site.open_source.why.title')}</h2>
              <p className="mt-2 text-pretty leading-relaxed text-loam-600">{tf('site.open_source.why.body')}</p>
            </div>
            <div>
              <h2 className="text-xl">{tf('site.open_source.heritage.title')}</h2>
              <p className="mt-2 text-pretty leading-relaxed text-loam-600">{tf('site.open_source.heritage.body')}</p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="white" id="donnees">
        <SectionHeading title={tf('site.open_source.data.title')} intro={tf('site.open_source.data.intro')} />
        <div className="relative mt-8 overflow-x-auto rounded-xl ring-1 ring-loam-200">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-loam-50 text-loam-700">
                <th scope="col" className="px-4 py-3 font-semibold">{columns.source}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{columns.use}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{columns.licence}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-loam-200 align-top">
              {rows.map((row) => (
                <tr key={row.source}>
                  <th scope="row" className="px-4 py-3.5 font-semibold text-loam-900">{row.source}</th>
                  <td className="px-4 py-3.5 text-loam-600">{row.use}</td>
                  <td className="px-4 py-3.5 text-loam-600">{row.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-loam-500">{tf('site.open_source.data.outro')}</p>
      </Section>

      <Section>
        <div className="flex flex-col items-start gap-5 rounded-2xl bg-leaf-50 p-6 ring-1 ring-leaf-100 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex gap-4">
            <Heart className="mt-1 h-6 w-6 shrink-0 text-leaf-600" aria-hidden="true" />
            <div className="max-w-2xl">
              <h2 className="text-xl">{tf('site.open_source.contribute.title')}</h2>
              <p className="mt-2 text-pretty text-loam-600">{tf('site.open_source.contribute.body')}</p>
            </div>
          </div>
          <a href={contribute.url} className={`${linkClass} shrink-0 bg-white text-loam-800 ring-1 ring-inset ring-loam-200 hover:bg-loam-100`}>
            {contribute.cta}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </Section>
    </>
  )
}
