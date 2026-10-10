import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Columns2, Download, Locate, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { visibleOffset } from '@/map/visiblePadding'
import { formatDateTime, headingLabel, photoDate, photoLabel, photoUrl } from '@/map/photos/format'
import { PhotoCameraDetails } from '@/map/photos/PhotoCameraDetails'
import { PhotoThumb } from '@/map/photos/PhotoThumb'
import { useSwipe } from '@/map/photos/useSwipe'
import { photoActions, usePhotos } from '@/map/photos/store'
import { downloadSketch } from '@/map/photos/sketch/download'
import { PhotoSketcher } from '@/map/photos/sketch/PhotoSketcher'
import { FittedPhoto, SketchLayer } from '@/map/photos/sketch/SketchLayer'
import type { MapPhotoData, PhotoSketchData } from '@/types/soil_photos'

/** "2026-05-17T14:32" for a datetime-local input, from the photo's date (shown in Brussels time). */
function toInputValue(photo: MapPhotoData): string {
  if (!photo.takenAt) return ''
  return photo.takenAt.slice(0, 16)
}

/** Full-screen view of one photo, with its details; arrows and keys move through the others. */
export function PhotoLightbox() {
  const editor = useEditor()
  const { photos, albums, openId } = usePhotos()
  const index = photos.findIndex((p) => p.id === openId)
  const photo = index >= 0 ? photos[index] : null
  const dialog = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const [caption, setCaption] = useState('')
  const [heading, setHeading] = useState('')
  const [candidates, setCandidates] = useState<MapPhotoData[] | null>(null)
  const photoId = photo?.id ?? null
  const [sketches, setSketches] = useState<PhotoSketchData[]>([])
  const [shownSketchId, setShownSketchId] = useState<number | null>(null)
  /** The sketch being drawn: an id, 'new', or null when only looking. */
  const [sketching, setSketching] = useState<number | 'new' | null>(null)

  useEffect(() => {
    if (!photo) return
    setCaption(photo.caption ?? '')
    setHeading(photo.heading != null ? String(Math.round(photo.heading)) : '')
    setCandidates(null)
    setSketches([])
    setShownSketchId(null)
    setSketching(null)
    // Reset only when another photo opens, not on every edit of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId])

  useEffect(() => {
    if (photoId == null) return
    let cancelled = false
    api<{ sketches: PhotoSketchData[] }>(`/maps/${editor.map.id}/photos/${photoId}/sketches`)
      .then((data) => {
        if (cancelled) return
        setSketches(data.sketches)
        // The latest idea is shown over the photo; « Photo seule » hides it.
        setShownSketchId(data.sketches.length ? data.sketches[data.sketches.length - 1].id : null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [photoId, editor.map.id])

  useEffect(() => {
    if (photoId == null) return
    returnFocus.current = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => returnFocus.current?.focus?.()
  }, [photoId == null])

  // The next and previous photos load in the background, so moving through them is instant.
  useEffect(() => {
    if (photoId == null) return
    const neighbours = [photos[index + 1], photos[index - 1]].filter(Boolean)
    const images = neighbours.map((other) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = photoUrl(editor.map.id, other.id, 'large')
      return image
    })
    return () => images.forEach((image) => { image.src = '' })
  }, [photoId, index, photos, editor.map.id])

  useEffect(() => {
    if (photoId == null || sketching != null) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      if (event.key === 'Escape') photoActions.open(null)
      else if (!typing && event.key === 'ArrowLeft' && index > 0) photoActions.open(photos[index - 1].id)
      else if (!typing && event.key === 'ArrowRight' && index < photos.length - 1) photoActions.open(photos[index + 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photoId, index, photos, sketching])

  const swipe = useSwipe({
    enabled: photoId != null && sketching == null,
    onPrevious: index > 0 ? () => photoActions.open(photos[index - 1].id) : undefined,
    onNext: index >= 0 && index < photos.length - 1 ? () => photoActions.open(photos[index + 1].id) : undefined,
  })

  if (!photo) return null
  const mapId = editor.map.id
  const shownSketch = sketches.find((s) => s.id === shownSketchId) ?? null

  function sketchSaved(saved: PhotoSketchData) {
    const isNew = !sketches.some((s) => s.id === saved.id)
    setSketches((list) => (list.some((s) => s.id === saved.id) ? list.map((s) => (s.id === saved.id ? saved : s)) : [...list, saved]))
    // The « Photos » panel marks and filters sketched photos by this count.
    if (isNew) photoActions.upsert({ ...photo!, sketchesCount: photo!.sketchesCount + 1 })
  }
  const base = `/maps/${mapId}/photos/${photo.id}`

  async function save(patch: Record<string, unknown>) {
    try {
      const saved = await api<MapPhotoData>(base, { method: 'PATCH', body: { photo: patch } })
      photoActions.upsert(saved)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  async function destroy() {
    if (!window.confirm(t('soil_photos.lightbox.confirm_delete'))) return
    try {
      await api(base, { method: 'DELETE' })
      const next = photos[index + 1] ?? photos[index - 1]
      photoActions.remove(photo!.id)
      if (next) photoActions.open(next.id)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  function locate() {
    if (photo!.lng == null || photo!.lat == null) return
    editor.instance.flyTo({ center: [photo!.lng, photo!.lat], zoom: Math.max(editor.instance.getZoom(), 18.5), duration: 800, offset: visibleOffset(editor.activePanel != null) })
    photoActions.open(null)
  }

  async function findSameSpot() {
    try {
      const data = await api<{ photos: MapPhotoData[] }>(`${base}/same_spot`)
      setCandidates(data.photos)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  function compareWith(other: MapPhotoData) {
    const [before, after] = photoDate(other) < photoDate(photo!) ? [other.id, photo!.id] : [photo!.id, other.id]
    photoActions.openCompare(before, after)
  }

  const positionLabel = photo.lng == null
    ? t('soil_photos.lightbox.not_placed')
    : t(`soil_photos.lightbox.location_sources.${photo.locationSource ?? 'manual'}`)
  const canEdit = editor.canEdit

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={photoLabel(photo)}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-loam-950 text-white outline-none md:flex-row"
    >
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-2 md:p-6"
        // Vertical scroll and pinch-zoom stay with the browser; a horizontal swipe turns the photo.
        style={{ touchAction: 'pan-y pinch-zoom' }}
        {...swipe.handlers}
      >
        <div
          className={clsx('flex h-full w-full', swipe.offset === 0 && 'transition-transform duration-200')}
          style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
        >
          <FittedPhoto
            src={photoUrl(mapId, photo.id, 'large')}
            alt={photoLabel(photo)}
            placeholder={photoUrl(mapId, photo.id, 'thumb')}
            initialAspect={photo.width && photo.height ? photo.width / photo.height : null}
            loadingLabel={t('soil_photos.lightbox.loading')}
            errorLabel={t('soil_photos.lightbox.load_failed')}
            overlay={(aspect) => shownSketch && <SketchLayer marks={shownSketch.strokes} aspect={aspect} className="pointer-events-none absolute inset-0 h-full w-full" />}
          />
        </div>
        <button type="button" onClick={() => photoActions.open(null)} className="absolute right-3 top-3 rounded-full bg-black/50 p-2 hover:bg-black/70" aria-label={t('common.close')}>
          <X className="h-5 w-5" />
        </button>
        {index > 0 && (
          <button type="button" onClick={() => photoActions.open(photos[index - 1].id)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/70" aria-label={t('soil_photos.lightbox.previous')}>
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button type="button" onClick={() => photoActions.open(photos[index + 1].id)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/70" aria-label={t('soil_photos.lightbox.next')}>
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs">
          {t('soil_photos.lightbox.counter', { index: index + 1, total: photos.length })}
        </p>
      </div>

      <aside className="max-h-[45%] shrink-0 space-y-3 overflow-y-auto bg-white p-4 text-loam-800 md:max-h-none md:w-80">
        <div>
          <p className="text-sm font-medium text-loam-900">{formatDateTime(photoDate(photo))}</p>
          <p className="mt-0.5 text-xs text-loam-500">
            {photo.uploadedBy ? t('soil_photos.lightbox.uploaded_by', { name: photo.uploadedBy }) : null}
            {photo.width && photo.height ? ` · ${photo.width} × ${photo.height}` : null}
          </p>
        </div>

        <Field label={t('soil_photos.lightbox.caption')}>
          <Textarea rows={2} value={caption} disabled={!canEdit} maxLength={500} placeholder={t('soil_photos.lightbox.caption_placeholder')}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => caption.trim() !== (photo.caption ?? '') && save({ caption: caption.trim() })} />
        </Field>

        <dl className="space-y-1 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-loam-400" />
            <div>
              <dt className="sr-only">{t('soil_photos.lightbox.position')}</dt>
              <dd>{positionLabel}</dd>
              {photo.heading != null && <dd className="text-xs text-loam-500">{t('soil_photos.lightbox.direction', { heading: headingLabel(photo.heading) })}</dd>}
            </div>
          </div>
        </dl>

        <PhotoCameraDetails photo={photo} />

        {canEdit && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('soil_photos.lightbox.taken_at')} className="col-span-2">
              <Input type="datetime-local" value={toInputValue(photo)} onChange={(e) => e.target.value && save({ taken_at: e.target.value })} />
            </Field>
            <Field label={t('soil_photos.lightbox.heading')} hint={t('soil_photos.lightbox.heading_hint')}>
              <Input
                type="number" min={0} max={359} inputMode="numeric" value={heading} placeholder="—"
                onChange={(e) => setHeading(e.target.value)}
                onBlur={() => {
                  const value = heading === '' ? null : Number(heading)
                  if (value !== photo.heading && (value === null || (value >= 0 && value < 360))) save({ heading: value })
                }}
              />
            </Field>
            <Field label={t('soil_photos.lightbox.album')}>
              <Select value={photo.albumId ?? ''} onChange={(e) => save({ photo_album_id: e.target.value || null })}>
                <option value="">{t('soil_photos.lightbox.no_album')}</option>
                {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {photo.lng != null && (
            <Button size="sm" variant="secondary" onClick={locate}>
              <Locate className="h-4 w-4" />
              {t('soil_photos.lightbox.locate')}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => photoActions.startPlacing(photo.id)}>
              <MapPin className="h-4 w-4" />
              {photo.lng == null ? t('soil_photos.lightbox.place') : t('soil_photos.lightbox.move')}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={findSameSpot} disabled={photo.lng == null} title={photo.lng == null ? t('soil_photos.lightbox.compare_needs_position') : undefined}>
            <Columns2 className="h-4 w-4" />
            {t('soil_photos.lightbox.compare')}
          </Button>
          {/* Viewers get the large variant, stripped of its metadata (GPS included). */}
          <a href={photoUrl(mapId, photo.id, canEdit ? 'original' : 'large', true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-100">
            <Download className="h-4 w-4" />
            {canEdit ? t('soil_photos.lightbox.download') : t('soil_photos.lightbox.download_variant')}
          </a>
        </div>

        <section aria-label={t('photo_sketches.list_label')}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('photo_sketches.list_label')}</h3>
          {sketches.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('photo_sketches.list_label')}>
              {[{ id: null, name: t('photo_sketches.none') }, ...sketches].map((sketch) => (
                <button
                  key={sketch.id ?? 'none'} type="button" role="radio" aria-checked={shownSketchId === sketch.id}
                  onClick={() => setShownSketchId(sketch.id)}
                  className={clsx('rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', shownSketchId === sketch.id ? 'bg-prune-600 text-white ring-prune-600' : 'text-prune-700 ring-prune-200 hover:bg-prune-50')}
                >
                  {sketch.name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {canEdit && (
              <Button size="sm" variant={sketches.length ? 'secondary' : 'primary'} onClick={() => setSketching('new')} title={t('photo_sketches.open_hint')}>
                {sketches.length ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {sketches.length ? t('photo_sketches.new') : t('photo_sketches.open')}
              </Button>
            )}
            {canEdit && shownSketch && (
              <Button size="sm" variant="secondary" onClick={() => setSketching(shownSketch.id)}>
                <Pencil className="h-4 w-4" />
                {t('photo_sketches.edit')}
              </Button>
            )}
            {shownSketch && (
              <Button size="sm" variant="ghost" onClick={() => downloadSketch(photoUrl(mapId, photo.id, 'large'), shownSketch.strokes, shownSketch.name).catch(() => editor.notify(t('photo_sketches.save_failed'), 'error'))}>
                <Download className="h-4 w-4" />
                {t('photo_sketches.download')}
              </Button>
            )}
          </div>
          {shownSketch?.createdBy && <p className="mt-1 text-xs text-loam-500">{t('photo_sketches.by', { name: shownSketch.createdBy })}</p>}
        </section>

        {candidates && (
          <section className="rounded-lg bg-prune-50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-prune-800">{t('soil_photos.lightbox.same_spot')}</h3>
            {candidates.length === 0 ? (
              <p className="mt-1 text-xs text-prune-800">{t('soil_photos.lightbox.same_spot_none')}</p>
            ) : (
              <ul className="mt-2 grid grid-cols-3 gap-1.5">
                {candidates.map((other) => (
                  <li key={other.id}>
                    <button type="button" onClick={() => compareWith(other)} className="block w-full text-left" title={photoLabel(other)}>
                      <span className="block aspect-square overflow-hidden rounded-md"><PhotoThumb mapId={mapId} photo={other} /></span>
                      <span className="mt-0.5 line-clamp-2 break-words text-[11px] leading-tight text-prune-800">{photoLabel(other)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {canEdit && (
          <Button size="sm" variant="ghost" className="text-clay-500" onClick={destroy}>
            <Trash2 className="h-4 w-4" />
            {t('common.delete')}
          </Button>
        )}
      </aside>
      {sketching != null && (
        <PhotoSketcher
          key={`${photo.id}-${sketching}`}
          mapId={mapId}
          photo={photo}
          sketch={sketching === 'new' ? null : sketches.find((s) => s.id === sketching) ?? null}
          notify={editor.notify}
          onSaved={sketchSaved}
          onDeleted={(id) => {
            setSketches((list) => list.filter((s) => s.id !== id))
            setShownSketchId(null)
            photoActions.upsert({ ...photo, sketchesCount: Math.max(0, photo.sketchesCount - 1) })
          }}
          onClose={(saved) => {
            setSketching(null)
            if (saved) setShownSketchId(saved.id)
            dialog.current?.focus()
          }}
        />
      )}
    </div>,
    document.body,
  )
}
