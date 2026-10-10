import clsx from 'clsx'
import { Columns2, Loader2, WandSparkles, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { photoUrl } from '@/map/photos/format'
import { PhotoThumb } from '@/map/photos/PhotoThumb'
import { getPhotosState, photoActions, usePhotos } from '@/map/photos/store'
import { renderSketchJpeg } from '@/map/photos/sketch/marks'
import pencilSample from '@/map/photos/rendering/samples/pencil.webp'
import photoSample from '@/map/photos/rendering/samples/photo.webp'
import watercolorSample from '@/map/photos/rendering/samples/watercolor.webp'
import type { MapPhotoData, PhotoRenderingData, PhotoRenderingsResponse, PhotoRenderingStyle, PhotoSketchData } from '@/types/soil_photos'

/** Each style with a sample: the same sketch of Les 4 Sources, painted three ways. */
const STYLES: { key: PhotoRenderingStyle; sample: string }[] = [
  { key: 'photo', sample: photoSample },
  { key: 'watercolor', sample: watercolorSample },
  { key: 'pencil', sample: pencilSample },
]
const POLL_MS = 3000
const INSTRUCTIONS_MAX = 500

const pending = (rendering: PhotoRenderingData) => rendering.status === 'queued' || rendering.status === 'running'

type Notify = (message: string, kind?: 'info' | 'error') => void

/**
 * « Mettre en image » for the photo open in the viewer: what the server
 * allows, the renderings of the photo, and the one that just finished. Polls
 * while an image is being painted; a finished image joins the map's photos.
 */
export function usePhotoRenderings(mapId: number, photo: MapPhotoData | null, notify: Notify) {
  const [info, setInfo] = useState<PhotoRenderingsResponse | null>(null)
  const [starting, setStarting] = useState(false)
  /** Finished while the viewer was on this photo: shown over it until dismissed. */
  const [finished, setFinished] = useState<PhotoRenderingData | null>(null)
  const photoId = photo?.id ?? null
  const base = `/maps/${mapId}/photos/${photoId}/renderings`

  useEffect(() => {
    let cancelled = false
    setInfo(null)
    setFinished(null)
    if (photoId == null) return
    api<PhotoRenderingsResponse>(base)
      .then((data) => {
        if (cancelled) return
        // Images painted while the viewer was elsewhere join the photos.
        const known = new Set(getPhotosState().photos.map((p) => p.id))
        data.renderings.forEach((r) => r.resultPhoto && !known.has(r.resultPhoto.id) && photoActions.upsert(r.resultPhoto))
        setInfo(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [base, photoId])

  const waiting = info?.renderings.filter(pending) ?? []
  const waitingKey = waiting.map((r) => r.id).join(',')

  // While an image is being painted, ask where it stands every few seconds.
  useEffect(() => {
    if (!waitingKey) return
    const timer = window.setTimeout(async () => {
      const updates = await Promise.all(
        waitingKey.split(',').map((id) => api<PhotoRenderingData>(`${base}/${id}`).catch(() => null)),
      )
      updates.forEach((update) => {
        if (!update || pending(update)) return
        if (update.status === 'done' && update.resultPhoto) photoActions.upsert(update.resultPhoto)
        setFinished(update)
        if (update.status === 'failed') notify(t(`photo_renderings.errors.${update.errorCode ?? 'failed'}`), 'error')
      })
      setInfo((current) => current && {
        ...current,
        renderings: current.renderings.map((r) => updates.find((u) => u?.id === r.id) ?? r),
      })
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [waitingKey, base, info, notify])

  const start = useCallback(async (style: PhotoRenderingStyle, sketch: PhotoSketchData | null, instructions: string) => {
    if (photoId == null) return false
    setStarting(true)
    try {
      const input = await renderSketchJpeg(photoUrl(mapId, photoId, 'large'), sketch?.strokes ?? [])
      const form = new FormData()
      form.append('input', input, 'mise-en-image.jpg')
      form.append('style', style)
      if (sketch) {
        form.append('sketch_id', String(sketch.id))
        form.append('instructions', instructions.trim())
      }
      const created = await api<PhotoRenderingData>(base, { method: 'POST', body: form })
      setFinished(null)
      setInfo((current) => current && { ...current, remaining: Math.max(0, current.remaining - 1), renderings: [created, ...current.renderings] })
      return true
    } catch (error) {
      notify(error instanceof ApiError ? error.message : t('photo_renderings.errors.start_failed'), 'error')
      return false
    } finally {
      setStarting(false)
    }
  }, [base, mapId, photoId, notify])

  const blocked = !info ? null : !info.available ? t('photo_renderings.unavailable') : !info.allowed ? t('photo_renderings.plan_needed')
    : info.remaining <= 0 ? t('photo_renderings.errors.monthly_limit', { limit: info.monthlyLimit }) : null

  return {
    info, waiting, starting, start, blocked, finished,
    dismiss: () => setFinished(null),
    done: info?.renderings.filter((r) => r.status === 'done' && r.resultPhotoId) ?? [],
  }
}

export type PhotoRenderingsState = ReturnType<typeof usePhotoRenderings>

/**
 * The magic wand over the photo: the way to « Mettre en image ». Shown to
 * editors when the service is plugged in; it says why when the plan or the
 * month's quota stands in the way.
 */
export function MagicWandButton({ renderings, hasSketch, onClick }: { renderings: PhotoRenderingsState; hasSketch: boolean; onClick: () => void }) {
  if (!renderings.info?.available || renderings.waiting.length > 0) return null
  return (
    <button
      type="button" onClick={onClick} disabled={renderings.blocked != null}
      title={renderings.blocked ?? t('photo_renderings.open_hint')}
      className={clsx(
        'group inline-flex items-center gap-2 rounded-full bg-white py-2 pl-3 pr-4 text-sm font-semibold text-loam-950 shadow-lg shadow-black/30 ring-1 ring-humus-200',
        'transition-transform duration-300 hover:-translate-y-0.5 hover:bg-humus-50 focus-visible:outline-2 focus-visible:outline-humus-300 disabled:opacity-60 disabled:hover:translate-y-0',
      )}
    >
      <span className={clsx('grid h-7 w-7 place-items-center rounded-full bg-humus-100 text-humus-700', hasSketch && 'motion-safe:animate-[wand_2.4s_ease-in-out_infinite]')}>
        <WandSparkles className="h-4 w-4" />
      </span>
      {t('photo_renderings.open')}
    </button>
  )
}

/** Choosing how to paint the idea: three styles shown on the same example, and what the strokes mean. */
export function RenderDialog({ renderings, sketch, onClose }: {
  renderings: PhotoRenderingsState
  sketch: PhotoSketchData | null
  onClose: () => void
}) {
  const [style, setStyle] = useState<PhotoRenderingStyle>('watercolor')
  const [instructions, setInstructions] = useState('')
  const info = renderings.info

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  async function launch() {
    if (await renderings.start(style, sketch, instructions)) onClose()
  }

  return (
    // On a phone the photo only has the top of the screen: the dialog takes all of it.
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-loam-950/60 p-2 md:absolute md:z-10 md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="render-dialog-title"
        className="max-h-full w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-loam-50 p-4 text-loam-800 shadow-2xl md:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-humus-100 text-humus-700"><WandSparkles className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="render-dialog-title" className="font-serif text-2xl text-loam-950">{t('photo_renderings.title')}</h2>
            <p className="text-sm text-loam-600">{sketch ? t('photo_renderings.intro_sketch', { sketch: sketch.name }) : t('photo_renderings.intro_photo')}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-loam-500 hover:bg-loam-200" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div role="radiogroup" aria-label={t('photo_renderings.style_label')} className="grid grid-cols-3 gap-2">
          {STYLES.map(({ key, sample }) => (
            <button
              key={key} type="button" role="radio" aria-checked={style === key} onClick={() => setStyle(key)}
              className={clsx(
                'overflow-hidden rounded-xl bg-white text-left ring-inset transition-shadow',
                style === key ? 'ring-[3px] ring-prune-600' : 'ring-1 ring-loam-200 hover:ring-prune-300',
              )}
            >
              <img src={sample} alt="" className="aspect-[3/2] w-full object-cover" loading="lazy" />
              <span className="block px-2 pb-2 pt-1.5">
                <span className={clsx('block text-sm font-semibold', style === key ? 'text-prune-700' : 'text-loam-900')}>{t(`photo_renderings.styles.${key}`)}</span>
                <span className="hidden text-xs leading-snug text-loam-500 sm:block">{t(`photo_renderings.style_hints.${key}`)}</span>
              </span>
            </button>
          ))}
        </div>

        {sketch && (
          <Field label={t('photo_renderings.instructions')} hint={t('photo_renderings.instructions_hint')}>
            <Textarea rows={2} maxLength={INSTRUCTIONS_MAX} value={instructions} placeholder={t('photo_renderings.instructions_placeholder')}
              onChange={(e) => setInstructions(e.target.value)} />
          </Field>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={launch} disabled={renderings.starting || renderings.blocked != null}>
            {renderings.starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            {t('photo_renderings.start')}
          </Button>
          <p className="min-w-0 flex-1 text-xs text-loam-500">
            {t('photo_renderings.no_notes')}{info ? ` ${t('photo_renderings.remaining', { count: info.remaining })}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Over the photo: the image taking shape, then the image itself when it is ready. */
export function RenderingStatus({ mapId, photo, renderings }: { mapId: number; photo: MapPhotoData; renderings: PhotoRenderingsState }) {
  const { photos } = usePhotos()
  const running = renderings.waiting[0]
  const finished = renderings.finished
  const result = finished?.resultPhotoId ? photos.find((p) => p.id === finished.resultPhotoId) : null

  if (running) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-3" role="status">
        <div className="flex max-w-sm items-center gap-3 overflow-hidden rounded-2xl bg-loam-50/95 px-4 py-3 text-sm text-loam-900 shadow-xl">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-humus-100 text-humus-700">
            <WandSparkles className="h-5 w-5 motion-safe:animate-[wand_1.6s_ease-in-out_infinite]" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{t('photo_renderings.running_title', { style: t(`photo_renderings.styles.${running.style}`).toLowerCase() })}</p>
            <p className="text-xs text-loam-600">{t('photo_renderings.running')}</p>
            <span className="mt-1.5 block h-1 w-40 overflow-hidden rounded-full bg-loam-200">
              <span className="block h-full w-1/3 rounded-full bg-humus-400 motion-safe:animate-[wash_1.8s_ease-in-out_infinite]" />
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (finished?.status === 'done' && result) {
    return (
      <div className="absolute inset-x-0 bottom-12 flex justify-center px-3">
        <div className="flex max-w-md items-center gap-3 rounded-2xl bg-loam-50 p-2 pr-3 text-sm text-loam-900 shadow-xl" role="status">
          <button type="button" onClick={() => photoActions.open(result.id)} className="h-16 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-loam-200" aria-label={t('photo_renderings.open_result')}>
            <PhotoThumb mapId={mapId} photo={result} />
          </button>
          <div className="min-w-0 space-y-1.5">
            <p className="font-semibold">{t('photo_renderings.ready')}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => photoActions.open(result.id)}>{t('photo_renderings.open_result')}</Button>
              <Button size="sm" variant="ghost" onClick={() => photoActions.openCompare(photo.id, result.id)}>
                <Columns2 className="h-4 w-4" />
                {t('photo_renderings.compare_result')}
              </Button>
            </div>
          </div>
          <button type="button" onClick={renderings.dismiss} className="self-start rounded-full p-1 text-loam-500 hover:bg-loam-200" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (finished?.status === 'failed') {
    return (
      <div className="absolute inset-x-0 bottom-12 flex justify-center px-3">
        <div className="flex max-w-md items-start gap-2 rounded-2xl bg-clay-50 px-4 py-3 text-sm text-clay-700 shadow-xl" role="alert">
          <p className="min-w-0 flex-1">{t(`photo_renderings.errors.${finished.errorCode ?? 'failed'}`)}</p>
          <button type="button" onClick={renderings.dismiss} className="rounded-full p-0.5 hover:bg-clay-100" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }
  return null
}

/** In the side column: the images already painted from this photo. */
export function RenderingResults({ mapId, renderings }: { mapId: number; renderings: PhotoRenderingsState }) {
  const { photos } = usePhotos()
  const results = renderings.done
    .map((rendering) => ({ rendering, photo: photos.find((p) => p.id === rendering.resultPhotoId) }))
    .filter((entry): entry is { rendering: PhotoRenderingData; photo: MapPhotoData } => entry.photo != null)
  if (results.length === 0) return null

  return (
    <section aria-label={t('photo_renderings.list_label')}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('photo_renderings.list_label')}</h3>
      <ul className="mt-1.5 grid grid-cols-3 gap-1.5">
        {results.map(({ rendering, photo }) => (
          <li key={rendering.id}>
            <button type="button" onClick={() => photoActions.open(photo.id)} className="block w-full text-left" title={t('photo_renderings.open_result')}
              aria-label={`${t('photo_renderings.open_result')} (${t(`photo_renderings.styles.${rendering.style}`)})`}>
              <span className="block aspect-square overflow-hidden rounded-md ring-1 ring-loam-200"><PhotoThumb mapId={mapId} photo={photo} /></span>
              <span className="mt-0.5 block truncate text-[11px] leading-tight text-loam-600">{t(`photo_renderings.styles.${rendering.style}`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** On a photo painted by « Mettre en image »: where it comes from, and the before/after with it. */
export function RenderingOrigin({ mapId, photo }: { mapId: number; photo: MapPhotoData }) {
  const { photos } = usePhotos()
  const source = photos.find((p) => p.id === photo.derivedFromId)
  if (!source) return null
  return (
    <div className="flex items-center gap-2 rounded-lg bg-leaf-50 p-2 text-xs text-leaf-900">
      <button type="button" onClick={() => photoActions.open(source.id)} className="h-12 w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-leaf-200" title={t('photo_renderings.back_to_source')}>
        <PhotoThumb mapId={mapId} photo={source} />
      </button>
      <div className="min-w-0 space-y-1">
        <p>{t('photo_renderings.from_photo', { style: t(`photo_renderings.styles.${photo.renderingStyle ?? 'photo'}`).toLowerCase() })}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button type="button" className="font-semibold text-prune-700 hover:underline" onClick={() => photoActions.open(source.id)}>
            {t('photo_renderings.back_to_source')}
          </button>
          <button type="button" className="font-semibold text-prune-700 hover:underline" onClick={() => photoActions.openCompare(source.id, photo.id)}>
            {t('photo_renderings.compare_source')}
          </button>
        </div>
      </div>
    </div>
  )
}
