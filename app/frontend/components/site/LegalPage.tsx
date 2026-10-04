import { TriangleAlert } from 'lucide-react'
import { PageHero } from '@/components/site/Section'
import { content, tf } from '@/lib/content'

export type LegalSection = { title: string; paragraphs?: string[]; items?: string[]; outro?: string }

/** A legal text (privacy, terms): a draft banner, a table of contents and numbered sections. */
export function LegalPage({ namespace, vars }: { namespace: 'privacy' | 'terms'; vars: Record<string, string | number> }) {
  const sections = content<LegalSection[]>(`site.legal.${namespace}.sections`, vars)
  return (
    <>
      <PageHero title={tf(`site.legal.${namespace}.title`)} lead={tf(`site.legal.${namespace}.lead`)}>
        <div role="note" className="flex gap-3 rounded-xl bg-humus-50 p-4 ring-1 ring-humus-200">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-humus-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-humus-700">{tf('site.common.draft_banner')}</p>
            <p className="mt-1 text-sm text-humus-700">{tf('site.common.draft_note')}</p>
            <p className="mt-1 text-sm text-humus-700">{tf('site.common.updated', { date: tf('site.legal.updated_on') })}</p>
          </div>
        </div>
      </PageHero>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[16rem_1fr] lg:py-16">
        <nav aria-label={tf(`site.legal.${namespace}.title`)} className="hidden lg:block">
          <ol className="sticky top-6 space-y-2 text-sm">
            {sections.map((section, index) => (
              <li key={section.title}>
                <a href={`#section-${index + 1}`} className="flex gap-2 text-loam-500 hover:text-prune-700">
                  <span className="w-5 shrink-0 text-loam-400">{index + 1}.</span>
                  <span>{section.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-3xl space-y-10">
          {sections.map((section, index) => (
            <section key={section.title} id={`section-${index + 1}`} className="scroll-mt-6">
              <h2 className="text-xl">
                <span className="mr-2 text-loam-400">{index + 1}.</span>
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-pretty leading-relaxed text-loam-700">
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items && (
                  <ul className="list-disc space-y-2 pl-5 marker:text-loam-300">
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
                {section.outro && <p>{section.outro}</p>}
              </div>
            </section>
          ))}
        </article>
      </div>
    </>
  )
}
