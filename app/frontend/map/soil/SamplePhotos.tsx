import clsx from 'clsx'
import { Camera, Check, Images, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { HandNote } from '@/components/ui/HandNote'
import { IconButton } from '@/components/ui/IconButton'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { photoLabel } from '@/map/photos/format'
import { PhotoThumb } from '@/map/photos/PhotoThumb'
import { photoAccept, photoActions, usePhotos } from '@/map/photos/store'
import { uploadActions, useUploads } from '@/map/photos/upload'
import { soilActions, useSoil } from '@/map/soil/store'
import type { MapPhotoData, SoilSampleData } from '@/types/soil_photos'

/**
 * « Photos du point »: the hole, the core laid on the ground, the profile.
 * At least one is always taken in the field; it is the only memory of how
 * the soil looked that day. Photos are sent from here (placed at the point
 * when they carry no GPS of their own) or chosen among the map's photos,
 * the closest to the point first.
 */
export default function SamplePhotos({ sample }: { sample: SoilSampleData }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const canEdit = editor.canEdit
  const { photos: mapPhotos, loaded, limits } = usePhotos()
  const uploads = useUploads()
  const [keys, setKeys] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // A photo deleted elsewhere (lightbox, Photos page) leaves the point at once.
  const known = useMemo(() => new Set(mapPhotos.map((p) => p.id)), [mapPhotos])
  const photos = loaded ? sample.photos.filter((p) => known.has(p.id)) : sample.photos
  const sending = uploads.filter((u) => keys.includes(u.key) && u.status !== 'done')
  const position = sample.lng != null && sample.lat != null ? { lng: sample.lng, lat: sample.lat } : null

  function send(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    const added = uploadActions.add(mapId, list, {
      soilSampleId: sample.id, fallbackPosition: position, useDevicePosition: !position,
      onDone: (photo) => soilActions.addPhoto(sample.id, photo),
    })
    setKeys((current) => [...current, ...added])
  }

  async function unlink(photo: MapPhotoData) {
    setBusy(true)
    try {
      await soilActions.linkPhotos(mapId, sample.id, photos.filter((p) => p.id !== photo.id).map((p) => p.id))
    } catch (e) {
      editor.notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const missing = photos.length === 0 && sending.length === 0

  return (
    <section className="space-y-2" aria-label={t('soil.sample.photos.title')}>
      <h4 className="text-sm font-semibold text-loam-800">
        {t('soil.sample.photos.title')}{photos.length > 0 ? ` · ${photos.length}` : ''}
      </h4>

      {missing && (
        sample.status === 'sampled'
          ? (
            <div className="space-y-1 rounded-lg bg-humus-50 p-2.5">
              <HandNote arrow="down">{t('soil.sample.photos.always')}</HandNote>
              <p className="text-sm text-humus-800">{t('soil.sample.photos.missing')}</p>
            </div>
          )
          : <p className="text-sm text-loam-500">{t('soil.sample.photos.planned')}</p>
      )}

      {(photos.length > 0 || sending.length > 0) && (
        <ul className="grid grid-cols-3 gap-1.5">
          {photos.map((photo) => (
            <li key={photo.id} className="relative">
              {/* design-lint-ok: a photo tile is the button, as in the inspector's photo grid */}
              <button type="button" onClick={() => photoActions.open(photo.id)} className="block w-full" title={photoLabel(photo)}>
                <span className="block aspect-square overflow-hidden rounded-lg bg-loam-100"><PhotoThumb mapId={mapId} photo={photo} /></span>
              </button>
              {canEdit && (
                <IconButton
                  size="sm" tone="neutral" label={t('soil.sample.photos.unlink')} disabled={busy} onClick={() => void unlink(photo)}
                  className="absolute right-1 top-1 bg-white/90 shadow"
                >
                  <X aria-hidden />
                </IconButton>
              )}
            </li>
          ))}
          {sending.map((upload) => (
            <li key={upload.key} className="relative aspect-square overflow-hidden rounded-lg bg-loam-100">
              {upload.previewUrl && !upload.video && <img src={upload.previewUrl} alt="" className="h-full w-full object-cover opacity-60" />}
              <span className="absolute inset-0 flex items-center justify-center p-1 text-center text-sm font-medium text-loam-800">
                {upload.status === 'error' || upload.status === 'duplicate'
                  ? <span className="rounded bg-white/90 px-1 text-clay-700" title={upload.message ?? undefined}>{t('soil.sample.photos.failed')}</span>
                  : <span className="inline-flex items-center gap-1 rounded bg-white/90 px-1"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{upload.progress}%</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={missing && sample.status === 'sampled' ? 'primary' : 'secondary'} onClick={() => input.current?.click()}>
            <Camera className="h-4 w-4" aria-hidden />{t('soil.sample.photos.add')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
            <Images className="h-4 w-4" aria-hidden />{t('soil.sample.photos.link')}
          </Button>
          <input
            ref={input} type="file" multiple accept={photoAccept(limits.contentTypes)} className="sr-only" aria-label={t('soil.sample.photos.add')}
            onChange={(e) => { send(e.target.files); e.target.value = '' }}
          />
        </div>
      )}
      {canEdit && missing && <p className="text-sm text-loam-500">{t('soil.sample.photos.hint')}</p>}

      {picking && <PhotoPicker sample={sample} linked={photos.map((p) => p.id)} onClose={() => setPicking(false)} />}
    </section>
  )
}

/** The map's photos to link to the point: those already linked, then the closest, then the newest. */
function PhotoPicker({ sample, linked, onClose }: { sample: SoilSampleData; linked: number[]; onClose: () => void }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const { samples } = useSoil()
  const [candidates, setCandidates] = useState<MapPhotoData[] | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(linked))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const labels = useMemo(() => new Map(samples.map((s) => [s.id, s.label])), [samples])

  useEffect(() => {
    let cancelled = false
    api<{ photos: MapPhotoData[] }>(`/maps/${mapId}/soil_samples/${sample.id}/photos`)
      .then((data) => !cancelled && setCandidates(data.photos))
      .catch((e) => { if (!cancelled) { setCandidates([]); setError((e as Error).message) } })
    return () => { cancelled = true }
  }, [mapId, sample.id])

  function toggle(id: number) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await soilActions.linkPhotos(mapId, sample.id, [...chosen])
      editor.notify(t('soil.sample.photos.linked', { count: chosen.size }))
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  function caption(photo: MapPhotoData): string | null {
    if (photo.soilSampleId === sample.id) return t('soil.sample.photos.here')
    if (photo.soilSampleId) return t('soil.sample.photos.at_other', { label: labels.get(photo.soilSampleId) ?? '' })
    if (photo.distanceM != null) return t('soil.sample.photos.distance', { meters: Math.round(photo.distanceM) })
    return null
  }

  return (
    <Dialog
      open onClose={onClose} title={t('soil.sample.photos.picker_title', { label: sample.label })}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('soil.sample.photos.cancel')}</Button>
          <Button onClick={() => void save()} disabled={saving || candidates === null}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t('soil.sample.photos.save', { count: chosen.size })}
          </Button>
        </>
      )}
    >
      <p className="mb-3 text-sm text-loam-600">{t('soil.sample.photos.picker_intro')}</p>
      {error && <p role="alert" className="mb-3 rounded-lg bg-clay-50 p-2.5 text-sm text-clay-700">{error}</p>}
      {candidates === null ? (
        <p className="flex items-center gap-2 text-sm text-loam-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('soil.sample.photos.loading')}</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-loam-500">{t('soil.sample.photos.none_on_map')}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {candidates.map((photo) => {
            const on = chosen.has(photo.id)
            const note = caption(photo)
            return (
              <li key={photo.id}>
                {/* design-lint-ok: a photo tile that ticks itself, no primitive for a picture checkbox */}
                <button
                  type="button" role="checkbox" aria-checked={on} onClick={() => toggle(photo.id)} title={photoLabel(photo)}
                  className={clsx('relative block w-full overflow-hidden rounded-lg ring-2 ring-offset-1 transition', on ? 'ring-prune-600' : 'ring-transparent hover:ring-loam-300')}
                >
                  <span className="block aspect-square bg-loam-100"><PhotoThumb mapId={mapId} photo={photo} /></span>
                  <span className={clsx('absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full shadow', on ? 'bg-prune-600 text-white' : 'bg-white/90 text-transparent')}>
                    <Check className="h-4 w-4" aria-hidden />
                  </span>
                </button>
                {note && <span className="mt-0.5 block truncate text-sm text-loam-500">{note}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
