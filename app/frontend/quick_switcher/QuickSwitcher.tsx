import { router, usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowRight, BookOpen, CornerDownLeft, Plus, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nextStepText } from '@/my_maps/ResumeCard'
import { PaletteStrip } from '@/my_maps/PaletteStrip'
import { StageIcon, StagePath } from '@/my_maps/StagePath'
import { TerrainSketch } from '@/my_maps/TerrainSketch'
import { openHelp } from '@/components/help/openHelp'
import { api } from '@/lib/api'
import { formatArea, t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { MapStage, SharedProps } from '@/types'
import type { HelpArticleSummary } from '@/types/billing'
import type { ResumeStep } from '@/types/myMaps'
import type { ListedMap, TeamAwareUser } from '@/types/teams'
import { byRecent, isSwitcherShortcut, rememberOpened, searchMaps, searchPages, type Match, type SwitcherMap, type SwitcherPage } from './match'

/** Anything (a header button) can open the switcher with this event. */
export const OPEN_QUICK_SWITCHER = 'quick-switcher:open'

export function openQuickSwitcher() {
  window.dispatchEvent(new Event(OPEN_QUICK_SWITCHER))
}

/** « ⌘J » on a Mac, « Ctrl+J » elsewhere. */
export function shortcutLabel() {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  return mac ? '⌘J' : 'Ctrl+J'
}

// The maps opened lately, remembered in this browser only.
const RECENT_KEY = 'designer.quickSwitcher.recent'
function readRecent(): number[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').filter(Number.isInteger) } catch { return [] }
}
function writeRecent(ids: number[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)) } catch { /* private window: no memory, no harm */ }
}

type Preview = { map: ListedMap; next: ResumeStep }
type Entry =
  | { type: 'map'; match: Match }
  | { type: 'page'; page: SwitcherPage }
  | { type: 'guide'; article: HelpArticleSummary }
  | { type: 'create'; name: string }

const entryKey = (entry: Entry) =>
  entry.type === 'map' ? `map-${entry.match.map.id}` : entry.type === 'page' ? `page-${entry.page.key}` : entry.type === 'guide' ? `guide-${entry.article.slug}` : 'create'

const GUIDES_SHOWN = 4

/**
 * Cmd+J / Ctrl+J from anywhere, map editor included: a centred field to type
 * a few letters of a map and jump to it. Arrows move, Enter opens. The maps
 * opened lately come first; a slip or the initials still find a map; pages
 * of the app and the help guides answer too. On a wide screen the chosen map shows its terrain,
 * which grows to year 30, and its next step. Mounted once (ImpersonationFrame).
 */
export default function QuickSwitcher() {
  const { currentUser } = usePage().props as unknown as SharedProps
  const url = usePage().url
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [maps, setMaps] = useState<SwitcherMap[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)
  const [recent, setRecent] = useState<number[]>(() => readRecent())
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    setQuery('')
    setActive(0)
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!currentUser) return
    const onKey = (event: KeyboardEvent) => {
      if (!isSwitcherShortcut(event)) return
      event.preventDefault()
      setOpen((was) => {
        if (!was) { setQuery(''); setActive(0) }
        return !was
      })
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener(OPEN_QUICK_SWITCHER, show)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener(OPEN_QUICK_SWITCHER, show)
    }
  }, [currentUser, show])

  // The list is fetched at each opening (it is light): a map shared a minute
  // ago is already there. The previous list answers while it comes.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setFailed(false)
    setRecent(readRecent())
    api<{ maps: SwitcherMap[] }>('/quick_switcher', { signal: controller.signal })
      .then((data) => setMaps(data.maps))
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [open])

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) { node.showModal(); input.current?.focus() }
    if (!open && node.open) node.close()
  }, [open])

  // Leaving the page closes it; opening a map, however, is remembered.
  const currentId = Number(url.match(/^\/maps\/(\d+)/)?.[1] ?? 0)
  useEffect(() => {
    setOpen(false)
    if (currentId) writeRecent(rememberOpened(readRecent(), currentId))
  }, [url, currentId])

  const guides = useGuides(open ? query : '')
  const pages = useMemo(() => appPages(currentUser as TeamAwareUser | null), [currentUser])
  const { entries, mapCount } = useMemo(() => {
    const found = searchMaps(byRecent(maps ?? [], recent), query)
    const list: Entry[] = found.map((match) => ({ type: 'map', match }))
    list.push(...searchPages(pages, query).map((page): Entry => ({ type: 'page', page })))
    list.push(...guides.map((article): Entry => ({ type: 'guide', article })))
    if (maps && found.length === 0 && query.trim()) list.push({ type: 'create', name: query.trim() })
    return { entries: list, mapCount: found.length }
  }, [maps, recent, query, pages, guides])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const chosen = entries[active]
  const preview = usePreview(open && chosen?.type === 'map' ? chosen.match.map.id : null)

  if (!currentUser) return null

  const go = (entry: Entry | undefined) => {
    if (!entry) return
    if (entry.type === 'guide') {
      setOpen(false)
      openHelp(entry.article.slug)
      return
    }
    const href = entry.type === 'map' ? `/maps/${entry.match.map.id}` : entry.type === 'page' ? entry.page.href : `/maps/new?name=${encodeURIComponent(entry.name)}`
    setOpen(false)
    if (href !== url) router.visit(href)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const count = entries.length
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault()
      setActive((i) => (count ? (i + 1) % count : 0))
    } else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault()
      setActive((i) => (count ? (i - 1 + count) % count : 0))
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      go(entries[active])
    }
  }

  const listId = 'quick-switcher-results'
  const typed = query.trim()
  const option = (entry: Entry, index: number) => ({
    id: `quick-switcher-${entryKey(entry)}`,
    'data-index': index,
    role: 'option' as const,
    'aria-selected': index === active,
    onMouseMove: () => { if (index !== active) setActive(index) },
    onClick: () => go(entry),
  })

  return (
    <dialog
      ref={dialog}
      aria-label={t('quick_switcher.title')}
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === dialog.current) setOpen(false) }}
      className="quick-switcher mx-auto mt-[8dvh] mb-auto w-[min(38rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-loam-50 p-0 text-loam-900 shadow-2xl ring-1 ring-loam-900/10 backdrop:bg-loam-950/40 backdrop:backdrop-blur-[2px] sm:mt-[12dvh] md:w-[min(60rem,calc(100vw-3rem))]"
    >
      {open && (
        <div onKeyDown={onKeyDown}>
          <div className="flex items-center gap-3 border-b border-loam-900/10 bg-white px-4">
            <Search className="h-5 w-5 shrink-0 text-prune-500" aria-hidden />
            <input
              ref={input}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('quick_switcher.placeholder')}
              aria-label={t('quick_switcher.placeholder')}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={chosen ? `quick-switcher-${entryKey(chosen)}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-14 min-w-0 flex-1 border-0 bg-transparent px-0 text-lg text-loam-900 outline-none placeholder:text-loam-400 focus:ring-0"
            />
            <kbd className="hidden shrink-0 rounded-md border border-loam-900/15 px-1.5 py-0.5 font-sans text-sm text-loam-500 sm:block">{t('quick_switcher.escape')}</kbd>
          </div>

          <div className="md:grid md:grid-cols-[minmax(0,1fr)_20rem]">
            <div ref={list} id={listId} role="listbox" className="max-h-[min(26rem,60dvh)] overflow-y-auto px-2 pb-2">
              {(mapCount > 0 || !typed) && (
                <p className="px-2 pt-3 pb-1 font-hand text-lg leading-none text-loam-500">
                  {typed ? t('quick_switcher.found', { count: mapCount }) : t('quick_switcher.recent')}
                </p>
              )}
              {entries.map((entry, index) => {
                const selected = index === active
                const rowClass = clsx(
                  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150',
                  selected ? 'bg-white shadow-sm ring-1 ring-prune-200' : 'hover:bg-white/60',
                )
                if (entry.type === 'map') {
                  const { map, highlight } = entry.match
                  return (
                    <div key={entryKey(entry)} {...option(entry, index)} className={rowClass}>
                      <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full', selected ? 'bg-prune-50 text-prune-600' : 'bg-loam-100 text-leaf-600')}>
                        <StageIcon stage={map.stage as MapStage} className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-loam-900">
                          <Highlighted text={map.name} range={highlight} />
                          {map.id === currentId && <span className="ml-2 text-sm font-normal text-loam-500">{t('quick_switcher.here')}</span>}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5 text-sm text-loam-500">
                          <span className="shrink-0">{t(`maps.stages.${map.stage}`)}</span>
                          {(map.teamName || map.address) && <span aria-hidden>·</span>}
                          {map.teamName && <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                          {(map.teamName || map.address) && <span className="truncate">{map.teamName ?? map.address}</span>}
                        </span>
                      </span>
                      {selected ? (
                        <CornerDownLeft className="h-4 w-4 shrink-0 text-prune-500 md:hidden" aria-hidden />
                      ) : null}
                      <span className={clsx('hidden shrink-0 font-hand text-base leading-none text-loam-400', !selected && 'sm:block md:hidden')}>{relativeTime(map.updatedAt)}</span>
                    </div>
                  )
                }
                const first = entries[index - 1]?.type !== entry.type
                const heading = entry.type === 'create' ? t('quick_switcher.none', { query: typed }) : entry.type === 'guide' ? t('quick_switcher.guides') : t('quick_switcher.pages')
                return (
                  <div key={entryKey(entry)}>
                    {first && <p className="px-2 pt-3 pb-1 font-hand text-lg leading-none text-loam-500">{heading}</p>}
                    <div {...option(entry, index)} className={rowClass}>
                      <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full', selected ? 'bg-prune-50 text-prune-600' : entry.type === 'guide' ? 'bg-leaf-50 text-leaf-600' : 'bg-loam-100 text-loam-500')}>
                        {entry.type === 'create' ? <Plus className="h-5 w-5" aria-hidden /> : entry.type === 'guide' ? <BookOpen className="h-5 w-5" aria-hidden /> : <ArrowRight className="h-5 w-5" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-loam-900">
                          {entry.type === 'create' ? t('quick_switcher.create', { name: entry.name }) : entry.type === 'guide' ? entry.article.title : entry.page.label}
                        </span>
                        {entry.type === 'guide' && <span className="block truncate text-sm text-loam-500">{entry.article.category}</span>}
                      </span>
                      {selected && <CornerDownLeft className="h-4 w-4 shrink-0 text-prune-500" aria-hidden />}
                    </div>
                  </div>
                )
              })}

              {maps && entries.length === 0 && !typed && <p className="px-3 py-4 text-sm text-loam-600">{t('quick_switcher.no_maps')}</p>}
              {!maps && !failed && <p className="px-3 py-4 text-sm text-loam-500">{t('quick_switcher.loading')}</p>}
              {failed && !maps && <p className="px-3 py-4 text-sm text-clay-700">{t('quick_switcher.failed')}</p>}
            </div>

            <PreviewPane preview={chosen?.type === 'map' ? preview : null} pending={chosen?.type === 'map' && !preview} entry={chosen} />
          </div>

          <footer className="hidden items-center gap-4 border-t border-loam-900/10 px-4 py-2.5 text-sm text-loam-500 sm:flex">
            <span><Key>↑</Key> <Key>↓</Key> {t('quick_switcher.hint_move')}</span>
            <span><Key>↵</Key> {t('quick_switcher.hint_open')}</span>
            <span className="ml-auto">{t('quick_switcher.hint_shortcut', { shortcut: shortcutLabel() })}</span>
          </footer>
        </div>
      )}
    </dialog>
  )
}

/**
 * The help guides matching what is typed (two letters at least), a moment
 * after typing stops. The switcher's searches are not counted as help
 * searches that found nothing: a map's name is not a missing guide.
 */
function useGuides(query: string): HelpArticleSummary[] {
  const [guides, setGuides] = useState<HelpArticleSummary[]>([])
  const typed = query.trim()
  useEffect(() => {
    if (typed.length < 2) { setGuides([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      api<{ results: HelpArticleSummary[] }>(`/help.json?from=switcher&q=${encodeURIComponent(typed)}`, { signal: controller.signal })
        .then((data) => setGuides(data.results.slice(0, GUIDES_SHOWN)))
        .catch(() => {})
    }, 180)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [typed])
  return guides
}

/** The chosen map's preview, fetched once per map and kept for the session. */
const previews = new Map<number, Preview>()
function usePreview(id: number | null): Preview | null {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!id || previews.has(id)) return
    const controller = new AbortController()
    // A short pause: arrowing through the list does not fetch every row.
    const timer = window.setTimeout(() => {
      api<Preview>(`/quick_switcher/${id}`, { signal: controller.signal })
        .then((data) => { previews.set(id, data); setTick((n) => n + 1) })
        .catch(() => {})
    }, 90)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [id])
  return id ? previews.get(id) ?? null : null
}

/**
 * Wide screens: the terrain as on « Mes cartes », which lets thirty years go
 * by a moment after it shows, its step and what comes next.
 */
function PreviewPane({ preview, pending, entry }: { preview: Preview | null; pending: boolean; entry: Entry | undefined }) {
  const [grown, setGrown] = useState(false)
  const id = preview?.map.id
  useEffect(() => {
    setGrown(false)
    if (!id) return
    const timer = window.setTimeout(() => setGrown(true), 450)
    return () => window.clearTimeout(timer)
  }, [id])

  return (
    <aside aria-hidden className="hidden min-h-[26rem] border-l border-dashed border-loam-900/15 bg-[#fffdf7] md:flex md:flex-col">
      {preview ? (
        <>
          <TerrainSketch key={preview.map.id} map={preview.map} grown={grown} className="block aspect-[4/3] w-full border-b border-dashed border-loam-200" />
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div>
              <p className="font-serif text-xl leading-tight font-semibold text-prune-800">{preview.map.name}</p>
              <p className="text-sm text-loam-500">
                {preview.map.areaM2 != null && <>{formatArea(preview.map.areaM2)} · </>}{t(`maps.roles.${preview.map.role}`)}
              </p>
            </div>
            <StagePath stage={preview.map.stage} small />
            <p className="font-hand text-lg leading-tight text-loam-800">
              <span className="bg-[linear-gradient(transparent_62%,rgba(239,155,13,.22)_62%)] box-decoration-clone px-0.5">{nextStepText(preview.next)}</span>
            </p>
            <PaletteStrip map={preview.map} />
          </div>
        </>
      ) : (
        <div className="m-auto max-w-[14rem] p-6 text-center font-hand text-lg leading-snug text-loam-400">
          {entry?.type === 'guide' ? (
            <span className="block text-left">
              <span className="block font-sans text-sm font-medium text-leaf-700">{entry.article.category}</span>
              <span className="mt-1 block font-serif text-xl leading-tight font-semibold text-prune-800">{entry.article.title}</span>
              <span className="mt-2 block text-loam-600">{entry.article.summary}</span>
            </span>
          ) : pending ? t('quick_switcher.preview_loading') : entry?.type === 'create' ? t('quick_switcher.preview_create') : entry?.type === 'page' ? t('quick_switcher.preview_page') : t('quick_switcher.preview_empty')}
        </div>
      )}
    </aside>
  )
}

/** The pages of the app the switcher answers with, by name or by a word for them. */
function appPages(user: TeamAwareUser | null): SwitcherPage[] {
  if (!user) return []
  return [
    { key: 'maps', label: t('nav.maps'), href: '/maps', keywords: t('quick_switcher.keywords.maps') },
    { key: 'new_map', label: t('maps.index.new'), href: '/maps/new', keywords: t('quick_switcher.keywords.new_map') },
    { key: 'tasks', label: t('tasks.nav'), href: '/tasks', keywords: t('quick_switcher.keywords.tasks') },
    ...(user.teamsCount ? [{ key: 'teams', label: t('teams.nav'), href: '/teams', keywords: t('quick_switcher.keywords.teams') }] : []),
    ...(user.newRequests != null ? [{ key: 'requests', label: t('request_forms.nav'), href: '/request_forms' }] : []),
    { key: 'plants', label: t('nav.plants'), href: '/plants', keywords: t('quick_switcher.keywords.plants') },
    { key: 'help', label: t('nav.help'), href: '/help', keywords: t('quick_switcher.keywords.help') },
    { key: 'news', label: t('release_notes.nav'), href: '/nouveautes' },
    { key: 'account', label: t('nav.account'), href: '/account', keywords: t('quick_switcher.keywords.account') },
    ...(user.admin ? [{ key: 'admin', label: t('admin.nav.link'), href: '/admin' }] : []),
  ]
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-grid min-w-6 place-items-center rounded-md border border-loam-900/15 bg-white px-1 font-sans text-sm text-loam-600">{children}</kbd>
}

function Highlighted({ text, range }: { text: string; range: [number, number] | null }) {
  if (!range) return <>{text}</>
  const [from, to] = range
  return (
    <>
      {text.slice(0, from)}
      <mark className="rounded-sm bg-humus-200/80 px-px text-loam-900">{text.slice(from, to)}</mark>
      {text.slice(to)}
    </>
  )
}
