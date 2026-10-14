import { router, usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { CornerDownLeft, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StageIcon } from '@/my_maps/StagePath'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { MapStage, SharedProps } from '@/types'
import { isSwitcherShortcut, searchMaps, type SwitcherMap } from './match'

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

/**
 * Cmd+J / Ctrl+J from anywhere, map editor included: a centred field to type
 * a few letters of a map and jump to it. Arrows move, Enter opens.
 * Mounted once for the signed-in person (ImpersonationFrame).
 */
export default function QuickSwitcher() {
  const { currentUser } = usePage().props as unknown as SharedProps
  const url = usePage().url
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [maps, setMaps] = useState<SwitcherMap[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

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

  // Leaving the page (a visit started elsewhere) closes it.
  useEffect(() => { setOpen(false) }, [url])

  const results = useMemo(() => searchMaps(maps ?? [], query), [maps, query])
  const currentId = Number(url.match(/^\/maps\/(\d+)/)?.[1] ?? 0)

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!currentUser) return null

  const go = (map: SwitcherMap | undefined) => {
    if (!map) return
    setOpen(false)
    if (map.id !== currentId || url !== `/maps/${map.id}`) router.visit(`/maps/${map.id}`)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault()
      setActive((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault()
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      go(results[active]?.map)
    }
  }

  const listId = 'quick-switcher-results'
  return (
    <dialog
      ref={dialog}
      aria-label={t('quick_switcher.title')}
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === dialog.current) setOpen(false) }}
      className="mx-auto mt-[8dvh] mb-auto w-[min(38rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-loam-50 p-0 text-loam-900 shadow-2xl ring-1 ring-loam-900/10 backdrop:bg-loam-950/40 backdrop:backdrop-blur-[2px] sm:mt-[14dvh]"
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
              aria-activedescendant={results[active] ? `quick-switcher-${results[active].map.id}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-14 min-w-0 flex-1 border-0 bg-transparent px-0 text-lg text-loam-900 outline-none placeholder:text-loam-400 focus:ring-0"
            />
            <kbd className="hidden shrink-0 rounded-md border border-loam-900/15 px-1.5 py-0.5 font-sans text-sm text-loam-500 sm:block">{t('quick_switcher.escape')}</kbd>
          </div>

          <p className="px-4 pt-3 pb-1 font-hand text-lg leading-none text-loam-500">
            {query.trim() ? t('quick_switcher.found', { count: results.length }) : t('quick_switcher.recent')}
          </p>

          <ul ref={list} id={listId} role="listbox" className="max-h-[min(24rem,55dvh)] overflow-y-auto px-2 pb-2">
            {results.map(({ map, highlight }, index) => (
              <li
                key={map.id}
                id={`quick-switcher-${map.id}`}
                data-index={index}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => setActive(index)}
                onClick={() => go(map)}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5',
                  index === active ? 'bg-white shadow-sm ring-1 ring-prune-200' : 'hover:bg-white/60',
                )}
              >
                <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full', index === active ? 'bg-prune-50 text-prune-600' : 'bg-loam-100 text-leaf-600')}>
                  <StageIcon stage={map.stage as MapStage} className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-loam-900">
                    <Highlighted text={map.name} range={highlight} />
                    {map.id === currentId && <span className="ml-2 text-sm font-normal text-loam-500">{t('quick_switcher.here')}</span>}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-loam-500">
                    <span className="shrink-0">{t(`maps.stages.${map.stage}`)}</span>
                    {map.teamName && (
                      <>
                        <span aria-hidden>·</span>
                        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{map.teamName}</span>
                      </>
                    )}
                    {map.address && !map.teamName && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{map.address}</span>
                      </>
                    )}
                  </span>
                </span>
                {index === active ? (
                  <CornerDownLeft className="h-4 w-4 shrink-0 text-prune-500" aria-hidden />
                ) : (
                  <span className="hidden shrink-0 font-hand text-base leading-none text-loam-400 sm:block">{relativeTime(map.updatedAt)}</span>
                )}
              </li>
            ))}
          </ul>

          {maps && results.length === 0 && (
            <p className="px-5 pb-5 text-sm text-loam-600">
              {query.trim() ? t('quick_switcher.none', { query: query.trim() }) : t('quick_switcher.no_maps')}
            </p>
          )}
          {!maps && !failed && <p className="px-5 pb-5 text-sm text-loam-500">{t('quick_switcher.loading')}</p>}
          {failed && !maps && <p className="px-5 pb-5 text-sm text-clay-700">{t('quick_switcher.failed')}</p>}

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
