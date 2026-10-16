import { Head, router } from '@inertiajs/react'
import clsx from 'clsx'
import {
  Camera, Check, CheckSquare, Flower2, FolderInput, FolderPlus, Images, ImagePlus, Leaf, Loader2, MapPinOff, Paintbrush, Pencil, Snowflake, Sun, Trash2, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { PHOTO_DRAG_TYPE, useFileDrag } from '@/lib/useFileDrag'
import { formatMegabytes, formatMonth, photoDate, photoLabel } from '@/map/photos/format'
import { PhotoHostContext, type PhotoHost } from '@/map/photos/host'
import { PhotoCompare } from '@/map/photos/PhotoCompare'
import { PhotoLightbox } from '@/map/photos/PhotoLightbox'
import { UploadList } from '@/map/photos/PhotosPanel'
import { PhotoThumb } from '@/map/photos/PhotoThumb'
import { photoAccept, photoActions, usePhotos } from '@/map/photos/store'
import { uploadActions, useUploads } from '@/map/photos/upload'
import type { MapPhotoData, PhotoAlbumData } from '@/types/soil_photos'

type Props = {
  map: { id: number; name: string; role: string | null; teamId?: number | null; offerBuilder?: boolean }
  canEdit: boolean
}

type Shelf = 'all' | 'none' | 'unplaced' | 'sketched' | number
type Sort = 'newest' | 'oldest' | 'added'
type Grouping = 'season' | 'month' | 'album' | 'none'
type Size = 's' | 'm' | 'l'

const GRID: Record<Size, string> = {
  s: 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8',
  m: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5',
  l: 'grid-cols-2 sm:grid-cols-3',
}
const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const
type Season = typeof SEASONS[number]
const SEASON_ICONS: Record<Season, typeof Sun> = { winter: Snowflake, spring: Flower2, summer: Sun, autumn: Leaf }

/** Meteorological seasons (northern hemisphere): December opens the winter of the year after. */
function seasonOf(date: Date): { key: string; season: Season; label: string } {
  const month = date.getMonth()
  const season: Season = month === 11 || month <= 1 ? 'winter' : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'autumn'
  const year = month === 11 ? date.getFullYear() + 1 : date.getFullYear()
  const label = season === 'winter'
    ? t('photo_pages.seasons.winter', { from: year - 1, to: year })
    : t(`photo_pages.seasons.${season}`, { year })
  return { key: `${year}-${SEASONS.indexOf(season)}`, season, label }
}

const PREFS_KEY = 'designer.photos.page'
function readPrefs(): { sort: Sort; grouping: Grouping; size: Size } {
  try {
    return { sort: 'newest', grouping: 'season', size: 'm', ...JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return { sort: 'newest', grouping: 'season', size: 'm' }
  }
}

/**
 * All the photos of a map on a full page: browse them by season, month or
 * album, sort them, select several to file them into an album (or drag them
 * onto one), and open any of them in the lightbox.
 */
export default function MapPhotos({ map, canEdit }: Props) {
  const state = usePhotos()
  const uploads = useUploads()
  const [shelf, setShelf] = useState<Shelf>('all')
  const [prefs, setPrefs] = useState(readPrefs)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<Shelf | null>(null)
  const draggingFiles = useFileDrag(canEdit)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => { photoActions.load(map.id) }, [map.id])
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // Private mode: the choice just does not persist.
    }
  }, [prefs])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = (message: string, tone: 'info' | 'error' = 'info') => setToast({ message, tone })
  const host = useMemo<PhotoHost>(() => ({
    mapId: map.id,
    canEdit,
    notify,
    locate: (photo) => router.visit(`/maps/${map.id}?photo=${photo.id}`),
    place: (photo) => router.visit(`/maps/${map.id}?place=${photo.id}`),
  }), [map.id, canEdit])

  const photos = state.photos
  const albumName = useMemo(() => new Map(state.albums.map((a) => [a.id, a.name])), [state.albums])

  const visible = useMemo(() => {
    const list = photos.filter((p) => {
      if (shelf === 'all') return true
      if (shelf === 'none') return p.albumId == null
      if (shelf === 'unplaced') return p.lng == null
      if (shelf === 'sketched') return p.sketchesCount > 0
      return p.albumId === shelf
    })
    if (prefs.sort === 'oldest') return [...list].reverse()
    if (prefs.sort === 'added') return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    return list
  }, [photos, shelf, prefs.sort])

  const groups = useMemo(() => {
    if (prefs.grouping === 'none') return [{ key: 'all', label: null as ReactNode, photos: visible }]
    const map = new Map<string, { key: string; label: ReactNode; photos: MapPhotoData[] }>()
    visible.forEach((photo) => {
      let key: string
      let label: ReactNode
      if (prefs.grouping === 'album') {
        key = String(photo.albumId ?? 'none')
        label = photo.albumId != null ? albumName.get(photo.albumId) : t('soil_photos.panel.no_album')
      } else if (prefs.grouping === 'month') {
        const date = prefs.sort === 'added' ? new Date(photo.createdAt) : photoDate(photo)
        key = `${date.getFullYear()}-${date.getMonth()}`
        label = formatMonth(date)
      } else {
        const season = seasonOf(prefs.sort === 'added' ? new Date(photo.createdAt) : photoDate(photo))
        const Icon = SEASON_ICONS[season.season]
        key = season.key
        label = <><Icon className="h-5 w-5 text-leaf-600" aria-hidden />{season.label}</>
      }
      const group = map.get(key) ?? { key, label, photos: [] }
      group.photos.push(photo)
      map.set(key, group)
    })
    return [...map.values()]
  }, [visible, prefs.grouping, prefs.sort, albumName])
  // The lightbox moves through the photos in the order they are shown.
  const ordered = useMemo(() => groups.flatMap((g) => g.photos), [groups])

  const counts = {
    all: photos.length,
    none: photos.filter((p) => p.albumId == null).length,
    unplaced: photos.filter((p) => p.lng == null).length,
    sketched: photos.filter((p) => p.sketchesCount > 0).length,
  }

  function onTileClick(photo: MapPhotoData, event: MouseEvent) {
    if (!selecting && !(canEdit && (event.metaKey || event.ctrlKey || event.shiftKey))) {
      photoActions.open(photo.id)
      return
    }
    setSelecting(true)
    const next = new Set(selected)
    if (event.shiftKey && anchor != null) {
      const from = ordered.findIndex((p) => p.id === anchor)
      const to = ordered.findIndex((p) => p.id === photo.id)
      ordered.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((p) => next.add(p.id))
    } else if (next.has(photo.id)) {
      next.delete(photo.id)
    } else {
      next.add(photo.id)
    }
    setAnchor(photo.id)
    setSelected(next)
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
    setAnchor(null)
  }

  async function fileInto(albumId: number | null, ids: number[]) {
    if (ids.length === 0) return
    try {
      const data = await api<{ photos: MapPhotoData[]; albums: PhotoAlbumData[] }>(`/maps/${map.id}/photos/bulk`, {
        method: 'PATCH', body: { ids, photo_album_id: albumId },
      })
      data.photos.forEach((p) => photoActions.upsert(p))
      photoActions.setAlbums(data.albums)
      notify(albumId == null
        ? t('photo_pages.filed_out', { count: ids.length })
        : t('photo_pages.filed', { count: ids.length, album: albumName.get(albumId) ?? '' }))
      stopSelecting()
    } catch (error) {
      notify((error as Error).message, 'error')
    }
  }

  async function destroySelected() {
    const ids = [...selected]
    if (!window.confirm(t('photo_pages.confirm_delete', { count: ids.length }))) return
    try {
      await api(`/maps/${map.id}/photos/bulk`, { method: 'DELETE', body: { ids } })
      ids.forEach((id) => photoActions.remove(id))
      notify(t('photo_pages.deleted', { count: ids.length }))
      stopSelecting()
    } catch (error) {
      notify((error as Error).message, 'error')
    }
  }

  function addFiles(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (list.length) uploadActions.add(map.id, list, { source: 'web', albumId: typeof shelf === 'number' ? shelf : null })
  }

  // Dragging photos onto an album files them there (the selection, or the one dragged).
  function onTileDragStart(event: DragEvent, photo: MapPhotoData) {
    const ids = selected.has(photo.id) ? [...selected] : [photo.id]
    event.dataTransfer.setData(PHOTO_DRAG_TYPE, JSON.stringify(ids))
    event.dataTransfer.effectAllowed = 'move'
  }
  function onShelfDrop(event: DragEvent, target: Shelf) {
    setDropTarget(null)
    const raw = event.dataTransfer.getData(PHOTO_DRAG_TYPE)
    if (!raw) return
    event.preventDefault()
    event.stopPropagation()
    void fileInto(target === 'none' ? null : (target as number), JSON.parse(raw))
  }
  const acceptsPhotos = (event: DragEvent) => event.dataTransfer.types.includes(PHOTO_DRAG_TYPE)

  const shelfProps = (value: Shelf) => {
    const droppable = canEdit && (value === 'none' || typeof value === 'number')
    return {
      'aria-pressed': shelf === value,
      onClick: () => setShelf(value),
      onDragOver: droppable ? (e: DragEvent) => { if (acceptsPhotos(e)) { e.preventDefault(); setDropTarget(value) } } : undefined,
      onDragLeave: droppable ? () => setDropTarget(null) : undefined,
      onDrop: droppable ? (e: DragEvent) => onShelfDrop(e, value) : undefined,
      className: clsx(
        'flex w-full shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-left text-sm lg:rounded-lg',
        dropTarget === value ? 'bg-leaf-100 text-leaf-800 ring-2 ring-leaf-500'
          : shelf === value ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50 lg:bg-transparent lg:ring-0',
      ),
    }
  }
  const count = (value: Shelf, n: number) => <span className={clsx('ml-auto text-sm', shelf === value ? 'text-prune-100' : 'text-loam-500')}>{n}</span>

  return (
    <div
      onDragOver={(e) => { if (canEdit && draggingFiles) e.preventDefault() }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); if (canEdit) addFiles(e.dataTransfer.files) } }}
    >
      <Head title={t('photo_pages.page_title', { map: map.name })} />
      <MapViewHeader map={map} current="photos" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl">{t('photo_pages.title')}</h1>
          <p className="mt-1 text-loam-600">{t('photo_pages.intro')}</p>
        </div>
        {canEdit && (
          <div className="flex max-w-xs flex-col items-start gap-1.5 sm:items-end sm:text-right">
            <Button onClick={() => fileInput.current?.click()}><ImagePlus className="h-4 w-4" />{t('soil_photos.panel.add')}</Button>
            <p className="text-sm text-loam-500">{t('soil_photos.panel.drop_hint', { max: formatMegabytes(state.limits.maxBytes), video_max: formatMegabytes(state.limits.videoMaxBytes) })}</p>
            <input ref={fileInput} type="file" multiple accept={photoAccept(state.limits.contentTypes)} className="sr-only" aria-label={t('soil_photos.panel.add')}
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          </div>
        )}
      </div>

      {uploads.length > 0 && <div className="mt-4 max-w-xl"><UploadList uploads={uploads} onClear={uploads.some((u) => u.status === 'done' || u.status === 'duplicate') ? uploadActions.clearFinished : undefined} /></div>}
      {state.error && <p className="mt-3 text-sm text-clay-600" role="alert">{state.error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label={t('photo_pages.shelves')} className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-4 lg:mx-0 lg:self-start lg:overflow-visible lg:px-0">
          <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
            <li><button type="button" {...shelfProps('all')}><Images className="h-4 w-4 shrink-0" aria-hidden />{t('soil_photos.panel.all_photos')}{count('all', counts.all)}</button></li>
            {counts.unplaced > 0 && <li><button type="button" {...shelfProps('unplaced')}><MapPinOff className="h-4 w-4 shrink-0" aria-hidden />{t('photo_pages.unplaced')}{count('unplaced', counts.unplaced)}</button></li>}
            {counts.sketched > 0 && <li><button type="button" {...shelfProps('sketched')}><Pencil className="h-4 w-4 shrink-0" aria-hidden />{t('photo_pages.sketched')}{count('sketched', counts.sketched)}</button></li>}
            <li className="hidden pt-3 text-sm font-medium text-loam-500 lg:block">{t('soil_photos.albums.title')}</li>
            {state.albums.map((album) => (
              <li key={album.id}><button type="button" {...shelfProps(album.id)}><FolderInput className="h-4 w-4 shrink-0 opacity-60" aria-hidden /><span className="truncate">{album.name}</span>{count(album.id, album.photosCount)}</button></li>
            ))}
            <li><button type="button" {...shelfProps('none')}>{t('soil_photos.panel.no_album')}{count('none', counts.none)}</button></li>
          </ul>
          {canEdit && <AlbumTools mapId={map.id} albums={state.albums} shelf={shelf} onShelf={setShelf} notify={notify} />}
          {canEdit && <p className="mt-3 hidden text-sm text-loam-500 lg:block">{t('photo_pages.drag_hint')}</p>}
        </nav>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={prefs.grouping} onChange={(e) => setPrefs({ ...prefs, grouping: e.target.value as Grouping })} aria-label={t('photo_pages.group.label')} className="!w-auto">
              {(['season', 'month', 'album', 'none'] as const).map((g) => <option key={g} value={g}>{t(`photo_pages.group.${g}`)}</option>)}
            </Select>
            <Select value={prefs.sort} onChange={(e) => setPrefs({ ...prefs, sort: e.target.value as Sort })} aria-label={t('photo_pages.sort.label')} className="!w-auto">
              {(['newest', 'oldest', 'added'] as const).map((s) => <option key={s} value={s}>{t(`photo_pages.sort.${s}`)}</option>)}
            </Select>
            <div role="group" aria-label={t('photo_pages.size.label')} className="inline-flex rounded-full bg-loam-100 p-0.5 text-sm">
              {(['s', 'm', 'l'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={prefs.size === s} onClick={() => setPrefs({ ...prefs, size: s })}
                  className={clsx('rounded-full px-3 py-1', prefs.size === s ? 'bg-white font-medium text-loam-900 shadow-sm' : 'text-loam-600')}>
                  {t(`photo_pages.size.${s}`)}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            {canEdit && photos.length > 0 && (
              <Button size="sm" variant={selecting ? 'primary' : 'secondary'} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
                <CheckSquare className="h-4 w-4" />{selecting ? t('photo_pages.select_done') : t('photo_pages.select')}
              </Button>
            )}
          </div>
          <p className="mt-3 text-sm text-loam-500">
            {t('soil_photos.panel.count', { count: visible.length })}
            {canEdit && !selecting && visible.length > 1 && <span className="hidden sm:inline"> · {t('photo_pages.select_hint')}</span>}
          </p>

          {state.loading && !state.loaded && <p className="mt-6 flex items-center gap-2 text-loam-500"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>}
          {state.loaded && photos.length === 0 && (
            <div className="mt-6 rounded-2xl bg-[#f7f3ea] p-6 ring-1 ring-loam-900/10 sm:p-8">
              <Camera className="h-8 w-8 text-leaf-600" aria-hidden />
              <h2 className="mt-3 font-serif text-2xl">{t('photo_pages.empty.title')}</h2>
              <p className="mt-2 max-w-xl text-loam-700">{t('photo_pages.empty.body')}</p>
            </div>
          )}
          {state.loaded && photos.length > 0 && visible.length === 0 && <p className="mt-6 text-loam-500">{t('photo_pages.none_here')}</p>}

          {groups.map((group) => group.photos.length > 0 && (
            <section key={group.key} className="mt-5">
              {group.label && (
                <h2 className="mb-2 flex items-center gap-2 font-serif text-xl text-loam-900">
                  {group.label}<span className="font-sans text-sm text-loam-500">{group.photos.length}</span>
                </h2>
              )}
              <ul className={clsx('grid gap-1.5 sm:gap-2', GRID[prefs.size])}>
                {group.photos.map((photo) => (
                  <li key={photo.id}>
                    <Tile mapId={map.id} photo={photo} selecting={selecting} selected={selected.has(photo.id)}
                      draggable={canEdit} onDragStart={onTileDragStart} onClick={onTileClick} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {selecting && (
        <div role="region" aria-label={t('photo_pages.selection')} className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-loam-900 px-4 py-3 text-white shadow-xl">
          <span className="text-sm font-medium">{t('photo_pages.selected', { count: selected.size })}</span>
          <button type="button" className="text-sm text-loam-300 underline-offset-2 hover:underline" onClick={() => setSelected(new Set(ordered.map((p) => p.id)))}>{t('photo_pages.select_all')}</button>
          <span className="flex-1" />
          <Select aria-label={t('photo_pages.file_into')} value="" disabled={selected.size === 0}
            onChange={(e) => e.target.value && fileInto(e.target.value === 'none' ? null : Number(e.target.value), [...selected])}
            className="!w-auto !bg-white !text-loam-900">
            <option value="">{t('photo_pages.file_into')}</option>
            {state.albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="none">{t('photo_pages.out_of_album')}</option>
          </Select>
          <Button size="sm" variant="danger" disabled={selected.size === 0} onClick={destroySelected}><Trash2 className="h-4 w-4" />{t('common.delete')}</Button>
          <button type="button" onClick={stopSelecting} className="rounded-full p-1.5 hover:bg-white/10" aria-label={t('common.cancel')}><X className="h-5 w-5" /></button>
        </div>
      )}

      {draggingFiles && canEdit && (
        <div className="pointer-events-none fixed inset-4 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-prune-500 bg-prune-50/80">
          <p className="font-serif text-2xl text-prune-800">{t('photo_pages.drop_now')}</p>
        </div>
      )}
      {toast && (
        <div role="status" className={clsx('fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg', toast.tone === 'error' ? 'bg-clay-500' : 'bg-loam-900')}>
          {toast.message}
        </div>
      )}

      <PhotoHostContext.Provider value={host}>
        <PhotoLightbox order={ordered} />
        <PhotoCompare />
      </PhotoHostContext.Provider>
    </div>
  )
}

function Tile({ mapId, photo, selecting, selected, draggable, onDragStart, onClick }: {
  mapId: number
  photo: MapPhotoData
  selecting: boolean
  selected: boolean
  draggable: boolean
  onDragStart: (event: DragEvent, photo: MapPhotoData) => void
  onClick: (photo: MapPhotoData, event: MouseEvent) => void
}) {
  return (
    <button
      type="button" onClick={(e) => onClick(photo, e)} aria-pressed={selecting ? selected : undefined}
      draggable={draggable} onDragStart={(e) => onDragStart(e, photo)}
      title={photoLabel(photo)}
      className={clsx(
        'group relative block aspect-square w-full overflow-hidden rounded-lg bg-loam-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-500',
        selected && 'ring-4 ring-prune-600',
      )}
    >
      <PhotoThumb mapId={mapId} photo={photo} className={clsx('transition duration-300', selected ? 'scale-90 rounded-md' : 'group-hover:scale-[1.03]')} />
      {photo.caption && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-6 text-left text-sm text-white opacity-0 transition group-hover:opacity-100">
          {photo.caption}
        </span>
      )}
      {selecting && (
        <span className={clsx('absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full ring-2 ring-white', selected ? 'bg-prune-600 text-white' : 'bg-black/30')}>
          {selected && <Check className="h-4 w-4" />}
        </span>
      )}
      <span className="absolute right-1.5 top-1.5 flex gap-1">
        {photo.derivedFromId != null && <Badge className="bg-leaf-600 text-white" label={t('photo_renderings.badge')}><Paintbrush className="h-3.5 w-3.5" /></Badge>}
        {photo.sketchesCount > 0 && <Badge className="bg-prune-600 text-white" label={t('photo_sketches.badge', { count: photo.sketchesCount })}><Pencil className="h-3.5 w-3.5" /></Badge>}
        {photo.lng == null && <Badge className="bg-humus-100 text-humus-700" label={t('soil_photos.panel.not_placed')}><MapPinOff className="h-3.5 w-3.5" /></Badge>}
      </span>
    </button>
  )
}

function Badge({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  return <span className={clsx('grid h-6 w-6 place-items-center rounded-full', className)} title={label}>{children}<span className="sr-only">{label}</span></span>
}

/** Create, rename and remove albums from the side of the page. */
function AlbumTools({ mapId, albums, shelf, onShelf, notify }: {
  mapId: number
  albums: PhotoAlbumData[]
  shelf: Shelf
  onShelf: (shelf: Shelf) => void
  notify: (message: string, tone?: 'info' | 'error') => void
}) {
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const base = `/maps/${mapId}/photo_albums`
  const current = typeof shelf === 'number' ? albums.find((a) => a.id === shelf) : undefined

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const album = await api<PhotoAlbumData>(base, { method: 'POST', body: { photo_album: { name: trimmed } } })
      photoActions.setAlbums([...albums, album])
      setName('')
      onShelf(album.id)
    } catch (error) {
      notify((error as Error).message, 'error')
    }
  }

  async function rename() {
    const trimmed = renaming?.trim()
    setRenaming(null)
    if (!current || !trimmed || trimmed === current.name) return
    try {
      const saved = await api<PhotoAlbumData>(`${base}/${current.id}`, { method: 'PATCH', body: { photo_album: { name: trimmed } } })
      photoActions.setAlbums(albums.map((a) => (a.id === current.id ? { ...saved, photosCount: a.photosCount } : a)))
    } catch (error) {
      notify((error as Error).message, 'error')
    }
  }

  async function destroy() {
    if (!current || !window.confirm(t('soil_photos.albums.confirm_delete'))) return
    try {
      await api(`${base}/${current.id}`, { method: 'DELETE' })
      photoActions.setAlbums(albums.filter((a) => a.id !== current.id))
      photoActions.load(mapId, true)
      onShelf('all')
    } catch (error) {
      notify((error as Error).message, 'error')
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {current && (renaming != null ? (
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void rename() }}>
          <Input value={renaming} onChange={(e) => setRenaming(e.target.value)} autoFocus maxLength={80} aria-label={t('soil_photos.albums.name')} className="!py-1.5" />
          <Button type="submit" size="sm" variant="secondary" aria-label={t('common.save')}><Check className="h-4 w-4" /></Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setRenaming(current.name)}><Pencil className="h-4 w-4" />{t('photo_pages.rename_album')}</Button>
          <Button size="sm" variant="ghost" className="text-clay-500" onClick={destroy}><Trash2 className="h-4 w-4" />{t('photo_pages.delete_album')}</Button>
        </div>
      ))}
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('soil_photos.albums.placeholder')} aria-label={t('soil_photos.albums.name')} className="!py-1.5" maxLength={80} />
        <Button type="submit" size="sm" variant="secondary" disabled={!name.trim()} aria-label={t('soil_photos.albums.create')} title={t('soil_photos.albums.create')}>
          <FolderPlus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
