import { Link } from '@inertiajs/react'
import { ChevronRight } from 'lucide-react'
import { Prose } from '@/components/help/Prose'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import type { HelpArticleFull, HelpArticleSummary } from '@/types/billing'

export default function HelpShow({ article, related, contactEmail }: { article: HelpArticleFull; related: HelpArticleSummary[]; contactEmail: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <nav aria-label={t('help.breadcrumb')} className="flex flex-wrap items-center gap-1.5 text-sm text-loam-500">
        <Link href="/help" className="hover:text-loam-900">{t('help.back')}</Link>
        <ChevronRight className="h-3.5 w-3.5 text-loam-300" aria-hidden="true" />
        <span>{article.category}</span>
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_16rem]">
        <article className="min-w-0 max-w-3xl">
          <h1 className="text-balance text-3xl leading-tight sm:text-4xl">{article.title}</h1>
          <p className="mt-3 text-pretty text-lg text-loam-500">{article.summary}</p>
          <Prose html={article.html} className="mt-8" />
          <div className="mt-12 rounded-2xl bg-white p-6 ring-1 ring-loam-200/70">
            <h2 className="text-base">{t('help.contact_title')}</h2>
            <p className="mt-1 text-sm text-loam-500">{tf('help.contact_body', { email: contactEmail })}</p>
          </div>
        </article>
        <aside className="space-y-8 lg:sticky lg:top-6 lg:self-start">
          {article.headings.length > 1 && (
            <nav aria-label={t('help.on_this_page')}>
              <h2 className="text-sm font-semibold text-loam-900">{t('help.on_this_page')}</h2>
              <ul className="mt-3 space-y-2 border-l border-loam-200 text-sm">
                {article.headings.map((heading) => (
                  <li key={heading.id}>
                    <a href={`#${heading.id}`} className="-ml-px block border-l border-transparent pl-3 text-loam-500 hover:border-prune-400 hover:text-prune-700">
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {related.length > 0 && (
            <nav aria-label={t('help.same_category')}>
              <h2 className="text-sm font-semibold text-loam-900">{t('help.same_category')}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link href={item.url} className="text-loam-600 hover:text-prune-700">{item.title}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
      </div>
    </div>
  )
}
