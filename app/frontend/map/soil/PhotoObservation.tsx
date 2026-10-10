import { usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { Camera, Check, ImagePlus, Loader2, MapPin, MapPinOff, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { downscaleImage } from '@/lib/image'
import { useEditor } from '@/map/editor/EditorContext'
import { readPhotoMeta } from '@/map/photos/exif'
import { photoActions } from '@/map/photos/store'
import { devicePosition } from '@/map/photos/upload'
import { IndicatorChips } from '@/map/soil/IndicatorChips'
import { soilActions } from '@/map/soil/store'
import type { SharedProps } from '@/types'
import type { PlantIdentificationCandidate, PlantIdentificationResponse } from '@/types/plants'
import type { Abundance, PhotoLocationSource, PhotoMeta } from '@/types/soil_photos'

const MAX_PHOTOS = 5
const ABUNDANCES: Abundance[] = ['rare', 'present', 'frequent', 'dominant']

type Photo = { key: number; file: File; url: string }
type Phase = 'idle' | 'resizing' | 'identifying' | 'saving'
type Position = { lng: number; lat: number; source: PhotoLocationSource }

/** The name the observation takes: the list's name, else Pl@ntNet's first common name, else the Latin name. */
export function candidateName(candidate: PlantIdentificationCandidate): string {
  return candidate.bioindicator?.name ?? candidate.commonNames[0] ?? candidate.latinName
}

/**
 * « Photographier une plante »: one to five photos of a wild plant go to
 * Pl@ntNet (through the server), the person picks the species, says how
 * abundant it is, and the plant is noted where the photo was taken. The first
 * photo is kept with the observation, among the map's photos. Without a
 * position (no GPS in the photo, none from the phone), the person places it
 * on the map right after.
 */
export default function PhotoObservation() {
  const editor = useEditor()
  const { env } = usePage().props as unknown as SharedProps
  const mapId = editor.map.id
  const [photos, setPhotos] = useState<Photo[]>([])
  const [position, setPosition] = useState<Position | null>(null)
  const [meta, setMeta] = useState<PhotoMeta | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [candidates, setCandidates] = useState<PlantIdentificationCandidate[] | null>(null)
  const [chosen, setChosen] = useState<PlantIdentificationCandidate | null>(null)
  const [abundance, setAbundance] = useState<Abundance>('present')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const nextKey = useRef(0)
  const request = useRef<AbortController | null>(null)
  const urls = useRef<string[]>([])
  const outcome = useRef<HTMLDivElement>(null)

  function reset() {
    request.current?.abort()
    urls.current.forEach((url) => URL.revokeObjectURL(url))
    urls.current = []
    setPhotos([])
    setPosition(null)
    setMeta(null)
    setPhase('idle')
    setCandidates(null)
    setChosen(null)
    setAbundance('present')
    setNotes('')
    setError(null)
    setNotice(null)
  }

  // Another map, or the panel closed: forget everything.
  useEffect(() => reset, [mapId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (candidates || error) outcome.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [candidates, error])

  const configured = env.plantnet
  const busy = phase !== 'idle'
  const pickDisabled = !configured || busy || photos.length >= MAX_PHOTOS || candidates !== null

  async function addPhotos(list: FileList | null, fromCamera: boolean) {
    const images = Array.from(list ?? []).filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
    if (images.length === 0) return
    const room = Math.max(0, MAX_PHOTOS - photos.length)
    const added = images.slice(0, room).map((file) => {
      const url = URL.createObjectURL(file)
      urls.current.push(url)
      return { key: nextKey.current++, file, url }
    })
    setNotice(images.length > room ? t('plantnet.section.too_many', { max: MAX_PHOTOS }) : null)
    setError(null)
    setPhotos([...photos, ...added])
    // The first photo is the one kept: it gives the place and the date.
    if (photos.length === 0 && added[0]) {
      const read = await readPhotoMeta(added[0].file)
      setMeta(read)
      if (read.lng != null && read.lat != null) {
        setPosition({ lng: read.lng, lat: read.lat, source: 'exif' })
      } else if (fromCamera) {
        const here = await devicePosition()
        if (here) setPosition({ ...here, source: 'device' })
      }
    }
  }

  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.url)
    urls.current = urls.current.filter((url) => url !== photo.url)
    const rest = photos.filter((p) => p.key !== photo.key)
    setPhotos(rest)
    setNotice(null)
    if (rest.length === 0) {
      setPosition(null)
      setMeta(null)
    }
  }

  async function identify() {
    if (photos.length === 0 || busy) return
    const controller = new AbortController()
    request.current = controller
    setError(null)
    setNotice(null)
    try {
      setPhase('resizing')
      const files = await Promise.all(photos.map((photo) => downscaleImage(photo.file)))
      if (controller.signal.aborted) return
      setPhase('identifying')
      const body = new FormData()
      files.forEach((file) => body.append('images[]', file, file.name))
      const response = await api<PlantIdentificationResponse>(`/maps/${mapId}/plant_identifications`, { method: 'POST', body, signal: controller.signal })
      setCandidates(response.candidates)
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof ApiError ? e.message : t('plantnet.section.network_error'))
    } finally {
      if (request.current === controller) {
        request.current = null
        setPhase('idle')
      }
    }
  }

  async function save() {
    if (!chosen || photos.length === 0) return
    setPhase('saving')
    setError(null)
    const field = (name: string, value: string | number | null | undefined) => {
      if (value !== null && value !== undefined && value !== '') form.append(`bioindicator_observation[${name}]`, String(value))
    }
    const form = new FormData()
    field('species_name', candidateName(chosen))
    field('latin_name', chosen.bioindicator?.latin ?? chosen.latinName)
    field('catalog_key', chosen.bioindicator?.key)
    field('plant_species_id', chosen.species?.id)
    field('abundance', abundance)
    field('notes', notes.trim())
    if (position) {
      field('lng', position.lng)
      field('lat', position.lat)
      field('location_source', position.source)
    }
    field('photo_taken_at', meta?.takenAt)
    field('photo_heading', meta?.heading)
    field('photo_source', 'web')
    form.append('bioindicator_observation[photo]', photos[0].file, photos[0].file.name)
    try {
      const saved = await soilActions.saveObservationWithPhoto(mapId, form)
      photoActions.load(mapId, true)
      reset()
      if (saved.lng == null || saved.lat == null) {
        soilActions.startPlacing({ kind: 'observation', id: saved.id })
      } else {
        editor.notify(t('soil.plants.photo.saved', { name: saved.speciesName }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  return (
    <section className="space-y-3 rounded-xl bg-leaf-50 p-3.5" aria-labelledby="bioindicator-photo-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="bioindicator-photo-title" className="text-sm font-semibold text-loam-800">{t('soil.plants.photo.title')}</h3>
        <HelpButton slug="analyser-son-sol" iconOnly label={t('soil.plants.photo.help')} />
      </div>
      {configured ? (
        <p className="text-xs text-loam-600">{t('soil.plants.photo.intro')}</p>
      ) : (
        <p className="rounded-lg bg-humus-50 p-2 text-xs text-humus-700">{t('soil.plants.photo.not_configured')}</p>
      )}

      {candidates === null && (
        <div className="grid grid-cols-2 gap-2">
          <PickButton icon={Camera} label={t('plantnet.section.take')} capture disabled={pickDisabled} onPick={(files) => addPhotos(files, true)} />
          <PickButton icon={ImagePlus} label={t('plantnet.section.choose')} disabled={pickDisabled} onPick={(files) => addPhotos(files, false)} />
        </div>
      )}

      {notice && <p className="text-xs text-humus-700" role="status">{notice}</p>}

      {photos.length > 0 && (
        <div className="space-y-2">
          <ul className="grid grid-cols-5 gap-1.5">
            {photos.map((photo, index) => (
              <li key={photo.key} className="relative aspect-square">
                <img src={photo.url} alt={t('plantnet.section.photo_alt', { index: index + 1 })} className={clsx('h-full w-full rounded-lg object-cover', index === 0 && 'ring-2 ring-leaf-600')} />
                {!busy && candidates === null && (
                  <button
                    type="button"
                    onClick={() => removePhoto(photo)}
                    className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-loam-600 shadow ring-1 ring-loam-200 hover:bg-loam-100"
                    aria-label={t('plantnet.section.remove')}
                    title={t('plantnet.section.remove')}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-loam-500">{t('soil.plants.photo.kept')}</p>
          <p className="flex items-center gap-1 text-xs text-loam-600">
            {position ? <MapPin className="h-3.5 w-3.5 shrink-0 text-leaf-700" aria-hidden /> : <MapPinOff className="h-3.5 w-3.5 shrink-0 text-humus-700" aria-hidden />}
            {position ? t(`soil.plants.photo.position_${position.source}`) : t('soil.plants.photo.no_position')}
          </p>
          {candidates === null && (
            <Button className="w-full" onClick={identify} disabled={busy || !configured}>
              {phase === 'resizing' ? t('plantnet.section.resizing') : phase === 'identifying' ? t('plantnet.section.identifying') : t('plantnet.section.identify')}
            </Button>
          )}
        </div>
      )}

      <div ref={outcome} aria-live="polite" className="space-y-2">
        {error && <p className="rounded-lg bg-clay-50 p-2 text-xs text-clay-700" role="alert">{error}</p>}

        {candidates && !chosen && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-loam-700">{t('plantnet.results.title')}</h4>
            {candidates.length === 0 ? (
              <p className="rounded-lg bg-white p-2 text-xs text-loam-600">{t('plantnet.results.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((candidate) => (
                  <li key={candidate.latinName} className="rounded-lg bg-white p-2.5 text-xs ring-1 ring-loam-100">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 text-sm font-medium text-loam-900">{candidateName(candidate)}</p>
                      <span className="shrink-0 tabular-nums text-loam-600">{t('plantnet.results.score', { percent: candidate.percent })}</span>
                    </div>
                    <p className="italic text-loam-500">{candidate.latinName}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-loam-200" aria-hidden="true">
                      <div className="h-full rounded-full bg-leaf-600" style={{ width: `${candidate.percent}%` }} />
                    </div>
                    {candidate.bioindicator ? (
                      <div className="mt-2 space-y-1">
                        <p className="flex items-center gap-1 font-medium text-leaf-800"><Check className="h-3.5 w-3.5" aria-hidden />{t('soil.plants.photo.in_list')}</p>
                        <IndicatorChips keys={candidate.bioindicator.indicates} unverified={candidate.bioindicator.unverified} />
                      </div>
                    ) : (
                      <p className="mt-2 text-loam-500">{t('soil.plants.photo.not_in_list')}</p>
                    )}
                    <Button variant="leaf" size="sm" className="mt-2 w-full" onClick={() => setChosen(candidate)}>{t('plantnet.results.choose')}</Button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="secondary" size="sm" className="w-full" onClick={reset}>{candidates.length === 0 ? t('plantnet.results.retry') : t('plantnet.results.none')}</Button>
            <p className="text-xs text-loam-400">
              {t('plantnet.results.credit')}
              <a href="https://plantnet.org" target="_blank" rel="noreferrer" className="underline hover:text-loam-600">Pl@ntNet</a>
            </p>
          </div>
        )}

        {chosen && (
          <form className="space-y-3 rounded-lg bg-white p-3 ring-1 ring-loam-100" onSubmit={(e) => { e.preventDefault(); save() }}>
            <div>
              <p className="text-sm font-medium text-loam-900">{candidateName(chosen)}</p>
              <p className="text-xs italic text-loam-500">{chosen.bioindicator?.latin ?? chosen.latinName}</p>
              {chosen.bioindicator && <IndicatorChips keys={chosen.bioindicator.indicates} unverified={chosen.bioindicator.unverified} className="mt-1" />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-loam-600">{t('soil.plants.abundance')}</span>
                <Select value={abundance} onChange={(e) => setAbundance(e.target.value as Abundance)}>
                  {ABUNDANCES.map((a) => <option key={a} value={a}>{t(`soil.abundances.${a}`)}</option>)}
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-loam-600">{t('soil.plants.notes')}</span>
                <Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={phase === 'saving'}>
                {phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MapPin className="h-4 w-4" aria-hidden />}
                {position ? t('soil.plants.photo.save') : t('soil.plants.photo.save_and_place')}
              </Button>
              <Button size="sm" variant="secondary" disabled={phase === 'saving'} onClick={() => setChosen(null)}>{t('soil.plants.photo.back')}</Button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

/** A file picker that looks like a button: `capture` opens the camera on phones. */
export function PickButton({ icon: Icon, label, capture, disabled, onPick }: {
  icon: LucideIcon; label: string; capture?: boolean; disabled: boolean; onPick: (files: FileList | null) => void
}) {
  return (
    <label className={clsx('rounded-lg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-prune-600', disabled && 'pointer-events-none opacity-50')}>
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        multiple={!capture}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => { onPick(e.target.files); e.target.value = '' }}
      />
      <span className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-sm font-medium text-loam-800 ring-1 ring-inset ring-loam-200 hover:bg-loam-100">
        <Icon className="h-4 w-4" aria-hidden="true" />{label}
      </span>
    </label>
  )
}
