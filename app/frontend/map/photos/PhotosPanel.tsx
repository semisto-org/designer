import clsx from 'clsx'
import {
  AlertCircle, Camera, Check, CheckCircle2, Columns2, FolderPlus, ImagePlus, Loader2, MapPin, MapPinOff, Pencil, RotateCw, Trash2, X,
} from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { formatDay, formatMegabytes, formatMonth, photoDate, photoLabel } from '@/map/photos/format'
import { PhotoThumb } from '@/map/photos/PhotoThumb'
import { photoAccept, photoActions, usePhotos } from '@/map/photos/store'
import { uploadActions, useUploads, type UploadItem } from '@/map/photos/upload'
import type { MapPhotoData, PhotoAlbumData } from '@/types/soil_photos'

type View = 'grid' | 'timeline'
type AlbumFilter = 'all' | 'none' | number

/** The « Photos » panel: add photos (many at once, from a phone too), browse by date or album, compare. */
export default function PhotosPanel() {
  const editor = useEditor()
  const state = usePhotos()
  const uploads = useUploads()
  const [view, setView] = useState<View>('grid')
  const [filter, setFilter] = useState<AlbumFilter>('all')
  const [comparing, setComparing] = useState<number | null | 'picking'>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const mapId = editor.map.id

  const visible = useMemo(() => state.photos.filter((p) => {
    if (filter === 'all') return true
    if (filter === 'none') return p.albumId == null
    return p.albumId === filter
  }), [state.photos, filter])
  const unplaced = state.photos.filter((p) => p.lng == null)

  const accept = photoAccept(state.limits.contentTypes)

  function addFiles(files: FileList | File[] | null, camera = false) {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    uploadActions.add(mapId, list, {
      source: camera ? 'phone' : 'web',
      useDevicePosition: camera,
      albumId: typeof filter === 'number' ? filter : null,
    })
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (editor.canEdit) addFiles(event.dataTransfer.files)
  }

  function onPhotoClick(photo: MapPhotoData) {
    if (comparing === 'picking') {
      setComparing(photo.id)
      return
    }
    if (typeof comparing === 'number') {
      if (photo.id === comparing) return
      // Older photo is the « before ».
      const [before, after] = photoDate(photo) < photoDate(state.photos.find((p) => p.id === comparing) as MapPhotoData)
        ? [photo.id, comparing] : [comparing, photo.id]
      setComparing(null)
      photoActions.openCompare(before, after)
      return
    }
    photoActions.open(photo.id)
  }

  const finished = uploads.some((u) => u.status === 'done' || u.status === 'duplicate')

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('soil_photos.panel.intro')}</p>

      {editor.canEdit ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx('rounded-xl border border-dashed p-3 text-center', dragging ? 'border-prune-500 bg-prune-50' : 'border-loam-300 bg-loam-50')}
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="h-4 w-4" />
              {t('soil_photos.panel.add')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => cameraInput.current?.click()}>
              <Camera className="h-4 w-4" />
              {t('soil_photos.panel.camera')}
            </Button>
          </div>
          <p className="mt-2 text-xs text-loam-500">
            {t('soil_photos.panel.drop_hint', { max: formatMegabytes(state.limits.maxBytes) })}
          </p>
          <input ref={fileInput} type="file" multiple accept={accept} className="sr-only" aria-label={t('soil_photos.panel.add')}
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={t('soil_photos.panel.camera')}
            onChange={(e) => { addFiles(e.target.files, true); e.target.value = '' }} />
        </div>
      ) : (
        <p className="rounded-lg bg-loam-50 p-3 text-xs text-loam-500">{t('soil_photos.panel.read_only')}</p>
      )}

      {uploads.length > 0 && <UploadList uploads={uploads} onClear={finished ? uploadActions.clearFinished : undefined} />}

      {editor.canEdit && unplaced.length > 0 && (
        <div className="rounded-lg bg-humus-50 p-3 text-sm text-humus-700">
          <p className="flex items-center gap-2 font-medium">
            <MapPinOff className="h-4 w-4 shrink-0" />
            {t('soil_photos.panel.unplaced', { count: unplaced.length })}
          </p>
          <p className="mt-1 text-xs">{t('soil_photos.panel.unplaced_hint')}</p>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {unplaced.slice(0, 12).map((photo) => (
              <button key={photo.id} type="button" onClick={() => photoActions.startPlacing(photo.id)}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-humus-200 hover:ring-2 hover:ring-humus-500"
                title={t('soil_photos.panel.place_this')} aria-label={`${t('soil_photos.panel.place_this')} : ${photoLabel(photo)}`}>
                <PhotoThumb mapId={mapId} photo={photo} />
                <MapPin className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full bg-white p-0.5 text-humus-600" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t('soil_photos.panel.view')} className="inline-flex rounded-lg bg-loam-100 p-0.5 text-xs">
          {(['grid', 'timeline'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={clsx('rounded-md px-2.5 py-1', view === v ? 'bg-white font-medium text-loam-900 shadow-sm' : 'text-loam-500')}>
              {t(`soil_photos.panel.views.${v}`)}
            </button>
          ))}
        </div>
        <Select
          aria-label={t('soil_photos.panel.album')}
          value={String(filter)}
          onChange={(e) => setFilter(e.target.value === 'all' || e.target.value === 'none' ? e.target.value : Number(e.target.value))}
          className="!w-auto flex-1 !py-1 text-xs"
        >
          <option value="all">{t('soil_photos.panel.all_photos')}</option>
          <option value="none">{t('soil_photos.panel.no_album')}</option>
          {state.albums.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.photosCount})</option>)}
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-loam-500">
        <span>{t('soil_photos.panel.count', { count: visible.length })}</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={state.showOnMap} onChange={(e) => photoActions.setShowOnMap(e.target.checked)} className="rounded border-loam-300 text-prune-600" />
          {t('soil_photos.panel.show_on_map')}
        </label>
        {state.photos.length >= 2 && (
          <button type="button" onClick={() => setComparing(comparing === null ? 'picking' : null)}
            className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-1', comparing === null ? 'text-prune-700 hover:bg-prune-50' : 'bg-prune-100 text-prune-800')}>
            <Columns2 className="h-3.5 w-3.5" />
            {comparing === null ? t('soil_photos.panel.compare') : t('soil_photos.panel.compare_cancel')}
          </button>
        )}
      </div>
      {comparing !== null && (
        <p className="rounded-lg bg-prune-50 p-2 text-xs text-prune-800" role="status">
          {comparing === 'picking' ? t('soil_photos.panel.compare_pick_first') : t('soil_photos.panel.compare_pick_second')}
        </p>
      )}

      {state.error && <p className="text-sm text-clay-500" role="alert">{state.error}</p>}
      {state.loading && !state.loaded && <p className="flex items-center gap-2 text-sm text-loam-500"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>}
      {state.loaded && state.photos.length === 0 && <p className="text-sm text-loam-500">{t('soil_photos.panel.empty')}</p>}

      {view === 'grid'
        ? <Grid mapId={mapId} photos={visible} selecting={comparing !== null ? comparing : undefined} onClick={onPhotoClick} />
        : <Timeline mapId={mapId} photos={visible} selecting={comparing !== null ? comparing : undefined} onClick={onPhotoClick} />}

      {editor.canEdit && <Albums albums={state.albums} onFilter={setFilter} filter={filter} />}
    </div>
  )
}

function Grid({ mapId, photos, onClick, selecting }: { mapId: number; photos: MapPhotoData[]; onClick: (p: MapPhotoData) => void; selecting?: number | 'picking' }) {
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {photos.map((photo) => <li key={photo.id}><Tile mapId={mapId} photo={photo} onClick={onClick} selected={selecting === photo.id} /></li>)}
    </ul>
  )
}

function Timeline({ mapId, photos, onClick, selecting }: { mapId: number; photos: MapPhotoData[]; onClick: (p: MapPhotoData) => void; selecting?: number | 'picking' }) {
  const months = useMemo(() => {
    const groups = new Map<string, { label: string; days: Map<string, { label: string; photos: MapPhotoData[] }> }>()
    photos.forEach((photo) => {
      const date = photoDate(photo)
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`
      const dayKey = `${monthKey}-${date.getDate()}`
      const month = groups.get(monthKey) ?? { label: formatMonth(date), days: new Map() }
      const day = month.days.get(dayKey) ?? { label: formatDay(date), photos: [] }
      day.photos.push(photo)
      month.days.set(dayKey, day)
      groups.set(monthKey, month)
    })
    return [...groups.values()]
  }, [photos])
  return (
    <div className="space-y-4">
      {months.map((month) => (
        <section key={month.label}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-loam-500">{month.label}</h3>
          <div className="space-y-2 border-l-2 border-loam-100 pl-3">
            {[...month.days.values()].map((day) => (
              <div key={day.label}>
                <p className="mb-1 text-xs text-loam-500">{day.label}</p>
                <ul className="grid grid-cols-4 gap-1.5">
                  {day.photos.map((photo) => <li key={photo.id}><Tile mapId={mapId} photo={photo} onClick={onClick} selected={selecting === photo.id} /></li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Tile({ mapId, photo, onClick, selected }: { mapId: number; photo: MapPhotoData; onClick: (p: MapPhotoData) => void; selected: boolean }) {
  return (
    <button type="button" onClick={() => onClick(photo)} aria-pressed={selected}
      title={photoLabel(photo)}
      className={clsx('relative block aspect-square w-full overflow-hidden rounded-md bg-loam-100 focus-visible:outline-2 focus-visible:outline-prune-500', selected && 'ring-2 ring-prune-600 ring-offset-1')}>
      <PhotoThumb mapId={mapId} photo={photo} />
      {photo.lng == null && (
        <span className="absolute bottom-0.5 left-0.5 grid h-5 w-5 place-items-center rounded-full bg-humus-100 text-humus-700" title={t('soil_photos.panel.not_placed')}>
          <MapPinOff className="h-3 w-3" />
        </span>
      )}
    </button>
  )
}

function UploadList({ uploads, onClear }: { uploads: UploadItem[]; onClear?: () => void }) {
  return (
    <div className="space-y-1.5" aria-live="polite">
      <ul className="space-y-1.5">
        {uploads.map((item) => (
          <li key={item.key} className="flex items-center gap-2 rounded-lg bg-white p-1.5 text-xs ring-1 ring-loam-200">
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-loam-100">
              {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover"
                // A HEIC photo has no preview outside Safari (the server converts it).
                onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} /> : <AlertCircle className="h-4 w-4 text-clay-500" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-loam-800">{item.name}</span>
              <StatusLine item={item} />
              {item.status === 'uploading' && (
                <span className="mt-1 block h-1 overflow-hidden rounded bg-loam-100" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                  <span className="block h-full bg-prune-500 transition-all" style={{ width: `${item.progress}%` }} />
                </span>
              )}
            </span>
            {item.status === 'error' && item.previewUrl && (
              <button type="button" onClick={() => uploadActions.retry(item.key)} className="rounded p-1 text-loam-500 hover:bg-loam-100" title={t('soil_photos.upload.retry')} aria-label={t('soil_photos.upload.retry')}>
                <RotateCw className="h-4 w-4" />
              </button>
            )}
            {item.status !== 'uploading' && (
              <button type="button" onClick={() => uploadActions.dismiss(item.key)} className="rounded p-1 text-loam-400 hover:bg-loam-100" title={t('soil_photos.upload.dismiss')} aria-label={t('soil_photos.upload.dismiss')}>
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {onClear && <button type="button" onClick={onClear} className="text-xs text-prune-700 underline">{t('soil_photos.upload.clear')}</button>}
    </div>
  )
}

function StatusLine({ item }: { item: UploadItem }) {
  switch (item.status) {
    case 'pending':
      return <span className="text-loam-500">{t('soil_photos.upload.pending')}</span>
    case 'uploading':
      return <span className="inline-flex items-center gap-1 text-loam-500"><Loader2 className="h-3 w-3 animate-spin" />{t('soil_photos.upload.uploading', { percent: item.progress })}</span>
    case 'done':
      return item.photo?.lng != null
        ? <span className="inline-flex items-center gap-1 text-leaf-700"><CheckCircle2 className="h-3 w-3" />{t('soil_photos.upload.done_placed')}</span>
        : <span className="inline-flex items-center gap-1 text-humus-700"><MapPinOff className="h-3 w-3" />{t('soil_photos.upload.done_unplaced')}</span>
    case 'duplicate':
      return <span className="text-loam-500">{item.message}</span>
    default:
      return <span className="text-clay-500" role="alert">{item.message}</span>
  }
}

function Albums({ albums, onFilter, filter }: { albums: PhotoAlbumData[]; onFilter: (f: AlbumFilter) => void; filter: AlbumFilter }) {
  const editor = useEditor()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const base = `/maps/${editor.map.id}/photo_albums`

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const album = await api<PhotoAlbumData>(base, { method: 'POST', body: { photo_album: { name: trimmed } } })
      photoActions.setAlbums([...albums, album])
      setName('')
      onFilter(album.id)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  async function rename(album: PhotoAlbumData) {
    const trimmed = draft.trim()
    setEditing(null)
    if (!trimmed || trimmed === album.name) return
    try {
      const saved = await api<PhotoAlbumData>(`${base}/${album.id}`, { method: 'PATCH', body: { photo_album: { name: trimmed } } })
      photoActions.setAlbums(albums.map((a) => (a.id === album.id ? { ...saved, photosCount: a.photosCount } : a)))
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  async function destroy(album: PhotoAlbumData) {
    if (!window.confirm(t('soil_photos.albums.confirm_delete'))) return
    try {
      await api(`${base}/${album.id}`, { method: 'DELETE' })
      photoActions.setAlbums(albums.filter((a) => a.id !== album.id))
      // Its photos stay on the map, outside any album.
      photoActions.load(editor.map.id, true)
      if (filter === album.id) onFilter('all')
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('soil_photos.albums.title')}</h3>
      <ul className="space-y-1">
        {albums.map((album) => (
          <li key={album.id} className="flex items-center gap-1 text-sm">
            {editing === album.id ? (
              <>
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename(album)} autoFocus className="!py-1" aria-label={t('soil_photos.albums.name')} />
                <button type="button" onClick={() => rename(album)} className="rounded p-1 text-leaf-600 hover:bg-leaf-50" aria-label={t('common.save')}><Check className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onFilter(album.id)} className={clsx('flex-1 truncate text-left', filter === album.id ? 'font-medium text-prune-700' : 'text-loam-700')}>
                  {album.name} <span className="text-xs text-loam-400">({album.photosCount})</span>
                </button>
                <button type="button" onClick={() => { setEditing(album.id); setDraft(album.name) }} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={`${t('common.edit')} ${album.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => destroy(album)} className="rounded p-1 text-loam-400 hover:bg-loam-100 hover:text-clay-500" aria-label={`${t('common.delete')} ${album.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); create() }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('soil_photos.albums.placeholder')} aria-label={t('soil_photos.albums.name')} className="!py-1.5" maxLength={80} />
        <Button type="submit" size="sm" variant="secondary" disabled={!name.trim()}>
          <FolderPlus className="h-4 w-4" />
          {t('soil_photos.albums.create')}
        </Button>
      </form>
    </section>
  )
}
