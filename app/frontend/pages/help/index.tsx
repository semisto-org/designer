import { Link, router } from '@inertiajs/react'
import { BookOpen, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageHero, Section } from '@/components/site/Section'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { inputClass } from '@/components/ui/Field'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import type { HelpArticleSummary, HelpCategory } from '@/types/billing'

type Props = {
  query: string
  categories: HelpCategory[]
  results: HelpArticleSummary[]
  contactEmail: string
}

export default function HelpIndex({ query, categories, results, contactEmail }: Props) {
  const [text, setText] = useState(query)
  const first = useRef(true)

  // Search as you type (debounced), without piling up history entries.
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const timer = setTimeout(() => {
      if (text.trim() === query.trim()) return
      router.get('/help', text.trim() ? { q: text.trim() } : {}, { preserveState: true, preserveScroll: true, replace: true, only: ['query', 'results'] })
    }, 250)
    return () => clearTimeout(timer)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  const searching = query.trim().length > 0
  return (
    <>
      <PageHero title={t('help.title')} lead={t('help.lead')}>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            router.get('/help', text.trim() ? { q: text.trim() } : {}, { preserveState: true, replace: true })
          }}
          className="flex max-w-xl gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" aria-hidden="true" />
            <input
              type="search"
              name="q"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label={t('help.search_label')}
              placeholder={t('help.search_placeholder')}
              autoComplete="off"
              className={`${inputClass} !py-2.5 pl-9 pr-9`}
            />
            {text && (
              <button
                type="button"
                onClick={() => setText('')}
                aria-label={t('help.clear')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-loam-400 hover:text-loam-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <Button type="submit" size="lg">{t('help.search_button')}</Button>
        </form>
      </PageHero>

      <Section>
        {searching && (
          <div className="mb-14">
            <h2 className="text-lg" aria-live="polite">{t('help.results', { count: results.length, query })}</h2>
            {results.length === 0 ? (
              <div className="mt-5">
                <EmptyState title={t('help.no_results_title', { query })}>{t('help.no_results_body')}</EmptyState>
              </div>
            ) : (
              <ul className="mt-5 grid gap-3">
                {results.map((article) => (
                  <li key={article.slug}>
                    <Link href={article.url} className="block rounded-xl bg-white p-5 shadow-sm ring-1 ring-loam-200/70 transition hover:ring-prune-300">
                      <span className="text-xs font-medium uppercase tracking-wide text-leaf-600">{article.category}</span>
                      <span className="mt-1 block text-base font-semibold text-loam-900">{article.title}</span>
                      <span className="mt-1 block text-sm text-loam-500">{article.excerpt ?? article.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {searching && <h2 className="mb-8 text-lg">{t('help.all_guides')}</h2>}
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, index) => (
            <section key={category.name} aria-labelledby={`help-category-${index}`}>
              <h2 id={`help-category-${index}`} className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-leaf-500" aria-hidden="true" />
                {category.name}
                <span className="text-xs font-normal text-loam-400">{t('help.guides_count', { count: category.articles.length })}</span>
              </h2>
              <ul className="mt-4 space-y-3">
                {category.articles.map((article) => (
                  <li key={article.slug}>
                    <Link href={article.url} className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-loam-200/70 transition hover:ring-prune-300">
                      <span className="block font-medium text-loam-900">{article.title}</span>
                      <span className="mt-1 block text-sm text-loam-500">{article.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-2xl bg-white p-6 ring-1 ring-loam-200/70 sm:p-8">
          <h2 className="text-lg">{t('help.contact_title')}</h2>
          <p className="mt-2 text-loam-500">{tf('help.contact_body', { email: contactEmail })}</p>
        </div>
      </Section>
    </>
  )
}
