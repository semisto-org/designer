import { ArrowLeft, ExternalLink, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Prose } from '@/components/help/Prose'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { HelpArticleFull, HelpArticleSummary, HelpCategory } from '@/types/billing'

type IndexData = { query: string; categories: HelpCategory[]; results: HelpArticleSummary[] }

// Fetched articles are kept for the session: reopening the drawer is instant.
const articleCache = new Map<string, HelpArticleFull>()

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Side drawer showing a help article without leaving the page (the map
 * editor, billing, account…). Without a slug it shows the index with
 * search. Closes with Esc, the backdrop or the close button; focus is kept
 * inside while open and returned to the opener on close.
 *
 * Usually used through <HelpButton slug="…" />.
 */
export function HelpDrawer({ open, slug, onClose }: { open: boolean; slug?: string | null; onClose: () => void }) {
  const [current, setCurrent] = useState<string | null>(slug ?? null)
  const [article, setArticle] = useState<HelpArticleFull | null>(null)
  const [index, setIndex] = useState<IndexData | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [attempt, setAttempt] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  // Start from the requested article each time the drawer opens.
  useEffect(() => {
    if (open) {
      setCurrent(slug ?? null)
      setQuery('')
    }
  }, [open, slug])

  const load = useCallback((signal: AbortSignal) => {
    setStatus('loading')
    const request = current
      ? articleCache.has(current)
        ? Promise.resolve(articleCache.get(current)!)
        : api<HelpArticleFull>(`/help/${current}.json`, { signal })
      : api<IndexData>(`/help.json${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`, { signal })
    request
      .then((data) => {
        if (current) {
          articleCache.set(current, data as HelpArticleFull)
          setArticle(data as HelpArticleFull)
          scroller.current?.scrollTo({ top: 0 })
        } else {
          setIndex(data as IndexData)
        }
        setStatus('idle')
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') setStatus('error')
      })
  }, [current, query])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    // The index search is debounced; articles load at once.
    const timer = setTimeout(() => load(controller.signal), current ? 0 : query ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [open, load, current, query, attempt])

  // Focus: in on open, back to the opener on close; Tab stays inside; Esc closes.
  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      } else if (event.key === 'Tab' && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [open, onClose])

  // Links to other articles stay in the drawer.
  const followInternalLink = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a')
    const match = link?.getAttribute('href')?.match(/^\/help\/([a-z0-9-]+)(#.*)?$/)
    if (match && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      setCurrent(match[1])
    }
  }

  if (!open || typeof document === 'undefined') return null
  const showArticle = current !== null && article?.slug === current
  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-loam-900/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('help.drawer.title')}
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl ring-1 ring-loam-200 sm:rounded-l-2xl"
      >
        <div className="flex items-center gap-2 border-b border-loam-200 px-4 py-3">
          {current ? (
            <button type="button" onClick={() => setCurrent(null)} className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-loam-600 hover:bg-loam-100">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('help.drawer.back')}
            </button>
          ) : (
            <h2 className="text-base">{t('help.drawer.title')}</h2>
          )}
          <button type="button" data-autofocus onClick={onClose} aria-label={t('help.drawer.close')} className="ml-auto rounded-md p-1.5 text-loam-500 hover:bg-loam-100 hover:text-loam-900">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-5" aria-busy={status === 'loading'}>
          {status === 'error' && (
            <div role="alert" className="rounded-lg bg-clay-50 p-4 text-sm text-clay-700">
              {t('help.drawer.error')}{' '}
              <button type="button" className="font-medium underline" onClick={() => setAttempt((n) => n + 1)}>
                {t('help.drawer.retry')}
              </button>
            </div>
          )}
          {status === 'loading' && !(showArticle || (!current && index)) && (
            <p className="text-sm text-loam-400">{t('help.drawer.loading')}</p>
          )}
          {current && showArticle && article && (
            <article>
              <p className="text-xs font-medium uppercase tracking-wide text-leaf-600">{article.category}</p>
              <h2 className="mt-1 text-xl leading-snug">{article.title}</h2>
              <Prose html={article.html} className="mt-4 prose-sm" onClick={followInternalLink} />
              <a href={article.url} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-prune-600 hover:text-prune-800">
                {t('help.drawer.full_page')}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </article>
          )}
          {!current && index && (
            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t('help.search_label')}
                  placeholder={t('help.drawer.search_placeholder')}
                  className="block w-full rounded-lg border-0 bg-white py-2 pl-9 pr-3 text-sm ring-1 ring-inset ring-loam-200 focus:ring-2 focus:ring-inset focus:ring-prune-500"
                />
              </div>
              {query.trim() && (
                <p className="mt-4 text-sm text-loam-500" aria-live="polite">{t('help.results', { count: index.results.length, query: query.trim() })}</p>
              )}
              <ul className="mt-4 space-y-5">
                {(query.trim() ? [{ name: '', articles: index.results }] : index.categories).map((category) => (
                  <li key={category.name || 'results'}>
                    {category.name && <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-400">{category.name}</h3>}
                    <ul className="mt-2 space-y-1">
                      {category.articles.map((item) => (
                        <li key={item.slug}>
                          <button type="button" onClick={() => setCurrent(item.slug)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-loam-100">
                            <span className="block text-sm font-medium text-loam-900">{item.title}</span>
                            <span className="mt-0.5 block text-xs text-loam-500">{item.excerpt ?? item.summary}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
