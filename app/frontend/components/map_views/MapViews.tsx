import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { CalendarRange, Camera, ChevronDown, ClipboardList, Files, Leaf, ListChecks, Map as MapIcon, MessageSquareText, Receipt } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'

/**
 * A project is seen through several views of the same place: the map, the
 * project sheet, its plant palette, its implementation plan, its tasks, its photos, its documents and, for a team's map,
 * its forms and, for whoever prices the project, its offer. The full pages
 * show them as tabs; the editor's header as a
 * small menu next to the map's name.
 */
export type MapViewKey = 'map' | 'project' | 'palette' | 'implementation' | 'tasks' | 'photos' | 'documents' | 'offer' | 'forms'

const VIEWS: { key: MapViewKey; icon: typeof MapIcon; path: string }[] = [
  { key: 'map', icon: MapIcon, path: '' },
  { key: 'project', icon: ClipboardList, path: '/project' },
  { key: 'palette', icon: Leaf, path: '/palette' },
  { key: 'implementation', icon: CalendarRange, path: '/implementation' },
  { key: 'tasks', icon: ListChecks, path: '/tasks' },
  { key: 'photos', icon: Camera, path: '/photos' },
  { key: 'documents', icon: Files, path: '/documents' },
  { key: 'offer', icon: Receipt, path: '/offer' },
  { key: 'forms', icon: MessageSquareText, path: '/forms' },
]

type ViewMap = { teamId?: number | null; offerBuilder?: boolean }

// « Formulaires » belongs to the team's maps (the forms are the team's);
// « Offre » to whoever prices the project (the team, or a pro owner).
const viewsFor = ({ teamId, offerBuilder }: ViewMap) =>
  VIEWS.filter((v) => (v.key !== 'forms' || teamId != null) && (v.key !== 'offer' || offerBuilder === true))

export const mapViewHref = (mapId: number, key: MapViewKey) => `/maps/${mapId}${VIEWS.find((v) => v.key === key)!.path}`

/** The heading of a full-page view: the map's name, then the views as tabs. */
export function MapViewHeader({ map, current }: { map: ViewMap & { id: number; name: string }; current: MapViewKey }) {
  return (
    <div className="mb-6">
      <p className="text-sm text-loam-500">
        <Link href="/maps" className="hover:text-loam-800">{t('map_views.my_maps')}</Link>
        <span aria-hidden> / </span>
        <Link href={`/maps/${map.id}`} className="hover:text-loam-800">{map.name}</Link>
      </p>
      <nav aria-label={t('map_views.label')} className="-mx-4 mt-3 overflow-x-auto border-b border-loam-900/10 px-4">
        <ul className="flex gap-1">
          {viewsFor(map).map(({ key, icon: Icon }) => (
            <li key={key} className="shrink-0">
              <Link
                href={mapViewHref(map.id, key)}
                aria-current={key === current ? 'page' : undefined}
                className={clsx(
                  '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium',
                  key === current ? 'border-prune-600 text-prune-700' : 'border-transparent text-loam-600 hover:border-loam-300 hover:text-loam-900',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />{t(`map_views.views.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** In the editor's header: « Carte ▾ », to reach the other views of the project. */
export function MapViewMenu({ mapId, teamId, offerBuilder }: ViewMap & { mapId: number }) {
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
          {viewsFor({ teamId, offerBuilder }).map(({ key, icon: Icon }) => (
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
