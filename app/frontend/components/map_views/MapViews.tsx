import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { Bot, CalendarRange, Camera, ChevronDown, ClipboardList, Clock, Files, Leaf, ListChecks, Map as MapIcon, MessageSquareText, PiggyBank, Receipt } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TabButton } from '@/components/ui/TabButton'
import { tabsOnLine } from '@/lib/tabOverflow'
import { t } from '@/lib/i18n'

/**
 * A project is seen through several views of the same place: the map, the
 * project sheet, its plant palette, its implementation plan, its tasks, its photos, its documents, its 20-year financial plan and, for a team's map,
 * its forms and, for whoever prices the project, its offer. The full pages
 * show them as tabs, those that do not fit under « Plus ▾ »; the editor's header as a
 * small menu next to the map's name.
 */
export type MapViewKey = 'map' | 'project' | 'palette' | 'implementation' | 'tasks' | 'photos' | 'documents' | 'finances' | 'offer' | 'time' | 'forms' | 'ai_journal'

const VIEWS: { key: MapViewKey; icon: typeof MapIcon; path: string }[] = [
  { key: 'map', icon: MapIcon, path: '' },
  { key: 'project', icon: ClipboardList, path: '/project' },
  { key: 'palette', icon: Leaf, path: '/palette' },
  { key: 'implementation', icon: CalendarRange, path: '/implementation' },
  { key: 'tasks', icon: ListChecks, path: '/tasks' },
  { key: 'photos', icon: Camera, path: '/photos' },
  { key: 'documents', icon: Files, path: '/documents' },
  { key: 'finances', icon: PiggyBank, path: '/finances' },
  { key: 'offer', icon: Receipt, path: '/offer' },
  { key: 'time', icon: Clock, path: '/time_entries' },
  { key: 'forms', icon: MessageSquareText, path: '/forms' },
  { key: 'ai_journal', icon: Bot, path: '/ai_journal' },
]

type ViewMap = { teamId?: number | null; offerBuilder?: boolean; timeEntries?: boolean; role?: string | null }

// « Formulaires » belongs to the team's maps (the forms are the team's);
// « Offre » to whoever prices the project (the team, or a pro owner);
// « Journal IA » to the map's owner (what an AI did on it);
// « Temps et dépenses » to the same people as « Offre », and to an editor who notes
// time there (`timeEntries`, given by that page).
const viewsFor = ({ teamId, offerBuilder, timeEntries, role }: ViewMap) =>
  VIEWS.filter((v) => (v.key !== 'forms' || teamId != null) && (v.key !== 'offer' || offerBuilder === true)
    && (v.key !== 'time' || offerBuilder === true || timeEntries === true)
    && (v.key !== 'ai_journal' || role === 'owner'))

export const mapViewHref = (mapId: number, key: MapViewKey) => `/maps/${mapId}${VIEWS.find((v) => v.key === key)!.path}`

/** The heading of a full-page view: the map's name, then the views as tabs. */
export function MapViewHeader({ map, current }: { map: ViewMap & { id: number; name: string }; current: MapViewKey }) {
  const views = viewsFor(map)
  const nav = useRef<HTMLElement>(null)
  const ruler = useRef<HTMLUListElement>(null)
  const [shown, setShown] = useState<number[] | null>(null)
  const [open, setOpen] = useState(false)

  // Tabs never scroll sideways (people do not find what is cut off): the row
  // keeps the tabs that fit on one line, and « Plus ▾ » holds the others.
  // An invisible copy of the row measures every tab and « Plus » itself.
  const currentIndex = views.findIndex((v) => v.key === current)
  const viewKeys = views.map((v) => v.key).join(',')
  useLayoutEffect(() => {
    const box = nav.current
    const measures = ruler.current
    if (!box || !measures) return
    const fit = () => {
      const items = Array.from(measures.children) as HTMLElement[]
      const widths = items.slice(0, -1).map((el) => el.getBoundingClientRect().width)
      const more = items[items.length - 1]?.getBoundingClientRect().width ?? 0
      const next = tabsOnLine(widths, box.clientWidth, more, currentIndex)
      setShown((prev) => (prev && prev.join() === next.join() ? prev : next))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    document.fonts?.ready.then(fit).catch(() => {})
    return () => observer.disconnect()
  }, [currentIndex, viewKeys])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !nav.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  const onLine = shown ?? views.map((_, i) => i)
  const under = views.filter((_, i) => !onLine.includes(i))
  const tab = (key: MapViewKey, Icon: typeof MapIcon, active: boolean) => (
    <span className={clsx(
      '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium',
      active ? 'border-prune-600 text-prune-700' : 'border-transparent text-loam-600 hover:border-loam-300 hover:text-loam-900',
    )}>
      <Icon className="h-4 w-4" aria-hidden />{t(`map_views.views.${key}`)}
    </span>
  )

  return (
    <div className="mb-6">
      <p className="text-sm text-loam-500">
        <Link href="/maps" className="hover:text-loam-800">{t('map_views.my_maps')}</Link>
        <span aria-hidden> / </span>
        <Link href={`/maps/${map.id}`} className="hover:text-loam-800">{map.name}</Link>
      </p>
      <nav ref={nav} aria-label={t('map_views.label')} className="relative mt-3 border-b border-loam-900/10">
        <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
          <ul ref={ruler} className="flex w-max">
            {views.map(({ key, icon }) => <li key={key} className="shrink-0">{tab(key, icon, false)}</li>)}
            <li className="shrink-0"><TabButton tabIndex={-1}>{t('map_views.more')}<ChevronDown className="h-4 w-4" aria-hidden /></TabButton></li>
          </ul>
        </div>
        <ul className="flex">
          {views.map(({ key, icon }, i) => onLine.includes(i) && (
            <li key={key} className="shrink-0">
              <Link href={mapViewHref(map.id, key)} aria-current={key === current ? 'page' : undefined} className="block rounded-t-lg focus-visible:outline-2 focus-visible:outline-prune-600">
                {tab(key, icon, key === current)}
              </Link>
            </li>
          ))}
          {under.length > 0 && (
            <li className="relative shrink-0">
              <TabButton onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
                {t('map_views.more')}<ChevronDown className={clsx('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
              </TabButton>
              {open && (
                <ul role="menu" className="absolute right-0 top-full z-40 mt-1.5 w-60 rounded-xl bg-white p-1 shadow-lg ring-1 ring-loam-900/10">
                  {under.map(({ key, icon: Icon }) => (
                    <li key={key} role="none">
                      <Link role="menuitem" href={mapViewHref(map.id, key)} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-loam-700 hover:bg-loam-50">
                        <Icon className="h-4 w-4 text-loam-500" aria-hidden />{t(`map_views.views.${key}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
        </ul>
      </nav>
    </div>
  )
}

/** In the editor's header: « Carte ▾ », to reach the other views of the project. */
export function MapViewMenu({ mapId, teamId, offerBuilder, timeEntries, role }: ViewMap & { mapId: number }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium text-loam-600 ring-1 ring-inset ring-loam-200 hover:bg-loam-50"
      >
        <MapIcon className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{t('map_views.views.map')}</span>
        <span className="sr-only sm:hidden">{t('map_views.label')}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <ul role="menu" className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-xl bg-white p-1 shadow-lg ring-1 ring-loam-900/10">
          {viewsFor({ teamId, offerBuilder, timeEntries, role }).map(({ key, icon: Icon }) => (
            <li key={key} role="none">
              {key === 'map' ? (
                <span role="menuitem" aria-current="page" className="flex items-center gap-2.5 rounded-lg bg-prune-50 px-3 py-2 text-sm font-medium text-prune-700">
                  <Icon className="h-4 w-4" aria-hidden />{t('map_views.views.map')}
                </span>
              ) : (
                <Link role="menuitem" href={mapViewHref(mapId, key)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-loam-700 hover:bg-loam-50">
                  <Icon className="h-4 w-4 text-loam-500" aria-hidden />{t(`map_views.views.${key}`)}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
