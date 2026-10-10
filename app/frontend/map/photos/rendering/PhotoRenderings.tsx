import clsx from 'clsx'
import { Camera, Loader2, Paintbrush, PencilLine, Palette } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { photoUrl } from '@/map/photos/format'
import { PhotoThumb } from '@/map/photos/PhotoThumb'
import { getPhotosState, photoActions, usePhotos } from '@/map/photos/store'
import { renderSketchJpeg } from '@/map/photos/sketch/marks'
import type { MapPhotoData, PhotoRenderingData, PhotoRenderingsResponse, PhotoRenderingStyle, PhotoSketchData } from '@/types/soil_photos'

const STYLES: { key: PhotoRenderingStyle; icon: typeof Camera }[] = [
  { key: 'photo', icon: Camera },
  { key: 'watercolor', icon: Palette },
  { key: 'pencil', icon: PencilLine },
]
const POLL_MS = 3000
const INSTRUCTIONS_MAX = 500

const pending = (rendering: PhotoRenderingData) => rendering.status === 'queued' || rendering.status === 'running'

/**
 * « Mettre en image », in the photo viewer: the photo, with the sketch shown
 * over it, painted as the idea could look once realised (photo, watercolour or
 * pencil). The image joins the map's photos at the same spot, where it can be
 * sketched on in turn.
 */
export function PhotoRenderings({ mapId, photo, sketch, canEdit, notify }: {
  mapId: number
  photo: MapPhotoData
  /** The sketch shown over the photo, the idea to paint (none: the photo alone). */
  sketch: PhotoSketchData | null
  canEdit: boolean
  notify: (message: string, kind?: 'info' | 'error') => void
}) {
  const { photos } = usePhotos()
  const [info, setInfo] = useState<PhotoRenderingsResponse | null>(null)
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<PhotoRenderingStyle>('watercolor')
  const [instructions, setInstructions] = useState('')
  const [starting, setStarting] = useState(false)
  const base = `/maps/${mapId}/photos/${photo.id}/renderings`

  useEffect(() => {
    let cancelled = false
    setInfo(null)
    setOpen(false)
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
  }, [base])

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
        if (update.status === 'done' && update.resultPhoto) {
          photoActions.upsert(update.resultPhoto)
          notify(t('photo_renderings.done'))
        } else if (update.status === 'failed') {
          notify(t(`photo_renderings.errors.${update.errorCode ?? 'failed'}`), 'error')
        }
      })
      setInfo((current) => current && {
        ...current,
        renderings: current.renderings.map((r) => updates.find((u) => u?.id === r.id) ?? r),
      })
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [waitingKey, base, info, notify])

  async function start() {
    setStarting(true)
    try {
      const input = await renderSketchJpeg(photoUrl(mapId, photo.id, 'large'), sketch?.strokes ?? [])
      const form = new FormData()
      form.append('input', input, 'mise-en-image.jpg')
      form.append('style', style)
      if (sketch) {
        form.append('sketch_id', String(sketch.id))
        form.append('instructions', instructions.trim())
      }
      const created = await api<PhotoRenderingData>(base, { method: 'POST', body: form })
      setInfo((current) => current && { ...current, remaining: Math.max(0, current.remaining - 1), renderings: [created, ...current.renderings] })
      setOpen(false)
    } catch (error) {
      notify(error instanceof ApiError ? error.message : t('photo_renderings.errors.start_failed'), 'error')
    } finally {
      setStarting(false)
    }
  }

  const done = info?.renderings.filter((r) => r.status === 'done' && r.resultPhotoId) ?? []
  const failed = info?.renderings.find((r) => r.status === 'failed')
  const latestIsFailed = failed && info?.renderings[0]?.id === failed.id
  const blocked = info && (!info.available ? t('photo_renderings.unavailable') : !info.allowed ? t('photo_renderings.plan_needed') : null)
  if (!info || (!canEdit && done.length === 0)) return null

  return (
    <section aria-label={t('photo_renderings.list_label')}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('photo_renderings.list_label')}</h3>

      {done.length > 0 && (
        <ul className="mt-1.5 grid grid-cols-3 gap-1.5">
          {done.map((rendering) => {
            const result = photos.find((p) => p.id === rendering.resultPhotoId)
            if (!result) return null
            return (
              <li key={rendering.id}>
                <button type="button" onClick={() => photoActions.open(result.id)} className="block w-full text-left" title={t('photo_renderings.open_result')} aria-label={`${t('photo_renderings.open_result')} (${t(`photo_renderings.styles.${rendering.style}`)})`}>
                  <span className="block aspect-square overflow-hidden rounded-md ring-1 ring-loam-200"><PhotoThumb mapId={mapId} photo={result} /></span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-loam-600">{t(`photo_renderings.styles.${rendering.style}`)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {waiting.length > 0 && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-leaf-50 px-2.5 py-2 text-xs text-leaf-800" role="status">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {t('photo_renderings.running')}
        </p>
      )}
      {latestIsFailed && waiting.length === 0 && (
        <p className="mt-2 rounded-lg bg-clay-50 px-2.5 py-2 text-xs text-clay-700">{t(`photo_renderings.errors.${failed.errorCode ?? 'failed'}`)}</p>
      )}

      {canEdit && !open && (
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={Boolean(blocked) || info.remaining <= 0} title={t('photo_renderings.open_hint')}>
            <Paintbrush className="h-4 w-4" />
            {t('photo_renderings.open')}
          </Button>
          {blocked && <p className="mt-1 text-xs text-loam-500">{blocked}</p>}
          {!blocked && info.remaining <= 0 && <p className="mt-1 text-xs text-loam-500">{t('photo_renderings.errors.monthly_limit', { limit: info.monthlyLimit })}</p>}
        </div>
      )}

      {canEdit && open && (
        <div className="mt-2 space-y-3 rounded-2xl bg-loam-50 p-3 ring-1 ring-inset ring-loam-200">
          <p className="text-xs text-loam-700">
            {sketch ? t('photo_renderings.intro_sketch', { sketch: sketch.name }) : t('photo_renderings.intro_photo')}
          </p>
          <div role="radiogroup" aria-label={t('photo_renderings.style_label')} className="grid grid-cols-3 gap-1.5">
            {STYLES.map(({ key, icon: Icon }) => (
              <button
                key={key} type="button" role="radio" aria-checked={style === key} onClick={() => setStyle(key)}
                title={t(`photo_renderings.style_hints.${key}`)}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-center text-xs font-medium ring-1 ring-inset transition-colors',
                  style === key ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-prune-700 ring-prune-200 hover:bg-prune-50',
                )}
              >
                <Icon className="h-5 w-5" />
                {t(`photo_renderings.styles.${key}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-loam-500">{t(`photo_renderings.style_hints.${style}`)}</p>
          {sketch && (
            <Field label={t('photo_renderings.instructions')} hint={t('photo_renderings.instructions_hint')}>
              <Textarea rows={2} maxLength={INSTRUCTIONS_MAX} value={instructions} placeholder={t('photo_renderings.instructions_placeholder')}
                onChange={(e) => setInstructions(e.target.value)} />
            </Field>
          )}
          <p className="text-xs text-loam-500">
            {t('photo_renderings.no_notes')} {t('photo_renderings.remaining', { count: info.remaining })}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={start} disabled={starting}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paintbrush className="h-4 w-4" />}
              {t('photo_renderings.start')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('photo_renderings.cancel')}</Button>
          </div>
        </div>
      )}
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
