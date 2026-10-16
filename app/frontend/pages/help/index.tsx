import { Link, router, usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components/ui/Card'
import { inputClass } from '@/components/ui/Field'
import { tf } from '@/lib/content'
import { t } from '@/lib/i18n'
import { StageIcon } from '@/my_maps/StagePath'
import type { MapStage, SharedProps } from '@/types'
import type { HelpArticleSummary, HelpCategory } from '@/types/billing'

type Season = { month: number; title: string; body: string; articles: HelpArticleSummary[] }

type Props = {
  query: string
  categories: HelpCategory[]
  results: HelpArticleSummary[]
  contactEmail: string
  season: Season | null
}

// Faint ruled lines, as on a field notebook's page.
const RULED = 'bg-[#fbf8f1] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,rgba(91,79,128,0.07)_31px,rgba(91,79,128,0.07)_32px)]'

/**
 * The help center as a field notebook: the season's page pinned at the top,
 * then the guides laid out along the four steps of the journey, as in the
 * editor, and the rest (sharing, AI, account) on the facing page.
 */
export default function HelpIndex({ query, categories, results, contactEmail, season }: Props) {
  const { currentUser } = usePage().props as unknown as SharedProps
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
  const start = categories[0] && !categories[0].stage ? categories[0] : undefined
  const journey = categories.filter((c) => c.stage)
  const others = categories.filter((c) => !c.stage && c !== start)

  return (
    <div className={RULED}>
      <header className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="max-w-2xl">
            <p className="font-hand text-2xl leading-none text-leaf-700">{t('help.notebook.eyebrow')}</p>
            <h1 className="mt-2 text-balance text-4xl leading-tight tracking-tight sm:text-5xl">{t('help.title')}</h1>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-loam-600">{t('help.lead')}</p>
            <form
              role="search"
              onSubmit={(event) => {
                event.preventDefault()
                router.get('/help', text.trim() ? { q: text.trim() } : {}, { preserveState: true, replace: true })
              }}
              className="relative mt-6 max-w-xl"
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-prune-500" aria-hidden="true" />
              <input
                type="search"
                name="q"
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-label={t('help.search_label')}
                placeholder={t('help.search_placeholder')}
                autoComplete="off"
                className={`${inputClass} !rounded-full !py-3 pl-12 pr-11 text-base shadow-sm`}
              />
              {text && (
                <button
                  type="button"
                  onClick={() => setText('')}
                  aria-label={t('help.clear')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-loam-400 hover:text-loam-700"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </form>
            {currentUser && <p className="mt-3 text-sm text-loam-500">{t('help.notebook.shortcut')}</p>}
          </div>
          {season && <SeasonNote season={season} />}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-16">
        {searching && (
          <section className="mb-14" aria-labelledby="help-results">
            <h2 id="help-results" className="text-xl" aria-live="polite">{t('help.results', { count: results.length, query })}</h2>
            {results.length === 0 ? (
              <div className="mt-5">
                <EmptyState title={t('help.no_results_title', { query })}>{t('help.no_results_body')}</EmptyState>
              </div>
            ) : (
              <ul className="mt-5 grid gap-3">
                {results.map((article) => (
                  <li key={article.slug}>
                    <Link href={article.url} className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-200/70 transition hover:ring-prune-300">
                      <span className="text-sm font-medium text-leaf-700">{article.category}</span>
                      <span className="mt-1 block text-base font-semibold text-loam-900">{article.title}</span>
                      <span className="mt-1 block text-sm text-loam-500">{article.excerpt ?? article.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {start && (
          <section aria-labelledby="help-start">
            <h2 id="help-start" className="font-hand text-3xl leading-none text-prune-700">{t('help.notebook.start')}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {start.articles.map((article, index) => (
                <li key={article.slug}>
                  <Link href={article.url} className="group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-200/70 transition hover:-translate-y-0.5 hover:ring-prune-300">
                    <span className="font-hand text-2xl leading-none text-leaf-600">{index + 1}</span>
                    <span className="mt-2 block font-semibold text-loam-900 group-hover:text-prune-700">{article.title}</span>
                    <span className="mt-1 block text-sm text-loam-500">{article.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {journey.length > 0 && (
          <section aria-labelledby="help-journey" className="mt-14">
            <h2 id="help-journey" className="font-hand text-3xl leading-none text-prune-700">{t('help.notebook.journey')}</h2>
            <p className="mt-2 max-w-2xl text-loam-600">{t('help.notebook.journey_lead')}</p>
            <ol className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {journey.map((category, index) => (
                <li key={category.name} className="relative rounded-2xl border border-dashed border-loam-300 bg-[#fffdf7]/90 p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-leaf-50 text-leaf-700 ring-1 ring-leaf-200">
                      <StageIcon stage={category.stage as MapStage} className="h-7 w-7" />
                    </span>
                    <div>
                      <p className="font-hand text-xl leading-none text-loam-500">{t('help.notebook.step', { number: index + 1 })}</p>
                      <h3 className="text-lg leading-tight">{category.name}</h3>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-1">
                    {category.articles.map((article) => (
                      <li key={article.slug}>
                        <Link href={article.url} title={article.summary} className="group flex gap-2 rounded-lg px-2 py-1.5 hover:bg-white">
                          <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-400 group-hover:bg-prune-500" />
                          <span className="text-loam-800 group-hover:text-prune-700">{article.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        )}

        {others.length > 0 && (
          <section aria-labelledby="help-others" className="mt-14">
            <h2 id="help-others" className="font-hand text-3xl leading-none text-prune-700">{t('help.notebook.others')}</h2>
            <div className="mt-5 grid gap-8 md:grid-cols-3">
              {others.map((category) => (
                <div key={category.name}>
                  <h3 className="text-lg">{category.name}</h3>
                  <ul className="mt-3 space-y-1">
                    {category.articles.map((article) => (
                      <li key={article.slug}>
                        <Link href={article.url} title={article.summary} className="group flex gap-2 rounded-lg px-2 py-1.5 hover:bg-white">
                          <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-loam-300 group-hover:bg-prune-500" />
                          <span className="text-loam-800 group-hover:text-prune-700">{article.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-16 rounded-2xl bg-white p-6 ring-1 ring-loam-200/70 sm:p-8">
          <h2 className="text-lg">{t('help.contact_title')}</h2>
          <p className="mt-2 text-loam-600">{tf('help.contact_body', { email: contactEmail })}</p>
        </div>
      </div>
    </div>
  )
}

/** This month's page, pinned to the notebook: what the garden asks for now. */
function SeasonNote({ season }: { season: Season }) {
  return (
    <aside aria-labelledby="help-season" className="relative mx-auto w-full max-w-sm rotate-[0.8deg] rounded-sm bg-[#fffdf5] p-6 pt-8 shadow-[0_10px_30px_rgba(38,30,20,0.12)] ring-1 ring-loam-900/5 lg:mt-4">
      <span aria-hidden="true" className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-2 bg-humus-200/70 shadow-sm" />
      <p className="text-sm font-medium text-leaf-700">{t('help.notebook.season')}</p>
      <h2 id="help-season" className="mt-1 font-hand text-3xl leading-tight text-prune-800">{season.title}</h2>
      <p className="mt-2 text-loam-700">{season.body}</p>
      <ul className="mt-4 space-y-1.5 border-t border-dashed border-loam-300 pt-3">
        {season.articles.map((article) => (
          <li key={article.slug}>
            <Link href={article.url} className={clsx('text-sm font-medium text-prune-700 underline decoration-prune-200 underline-offset-2 hover:decoration-prune-700')}>
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
