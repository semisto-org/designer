import { usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { Camera, Check, ImagePlus, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { downscaleImage } from '@/lib/image'
import { useEditor } from '@/map/editor/EditorContext'
import { ownProperties } from '@/map/plants/properties'
import type { MapFeature, SharedProps } from '@/types'
import type { PlantIdentificationCandidate, PlantIdentificationResponse } from '@/types/plants'

const MAX_PHOTOS = 5

type Photo = { key: number; file: File; url: string }
type Phase = 'idle' | 'resizing' | 'identifying'

/**
 * Inspector section of a plant: « Identifier l'espèce par photo ». One to five
 * photos of the same plant go to Pl@ntNet (through the server), the candidate
 * species come back with their score and the catalogue species they match.
 * Nothing is saved until the editor picks one (« C'est elle »).
 */
export default function IdentifySection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { env } = usePage().props as unknown as SharedProps
  const featureId = feature.properties.id
  const [photos, setPhotos] = useState<Photo[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [candidates, setCandidates] = useState<PlantIdentificationCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nextKey = useRef(0)
  const request = useRef<AbortController | null>(null)
  const urls = useRef<string[]>([])
  const outcome = useRef<HTMLDivElement>(null)

  function reset() {
    request.current?.abort()
    urls.current.forEach((url) => URL.revokeObjectURL(url))
    urls.current = []
    setPhotos([])
    setPhase('idle')
    setCandidates(null)
    setError(null)
    setNotice(null)
  }

  // Another plant selected, or the inspector closed: forget the photos and results.
  useEffect(() => {
    reset()
    return reset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId])

  // The panel is tall: bring the answer (or the error) into view once it arrives.
  useEffect(() => {
    if (candidates || error) outcome.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [candidates, error])

  if (!editor.canEdit) return null

  const configured = env.plantnet
  const busy = phase !== 'idle'
  const pickDisabled = !configured || busy || photos.length >= MAX_PHOTOS

  function addPhotos(list: FileList | null) {
    const images = Array.from(list ?? []).filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    const room = Math.max(0, MAX_PHOTOS - photos.length)
    const added = images.slice(0, room).map((file) => {
      const url = URL.createObjectURL(file)
      urls.current.push(url)
      return { key: nextKey.current++, file, url }
    })
    setNotice(images.length > room ? t('plantnet.section.too_many', { max: MAX_PHOTOS }) : null)
    setError(null)
    setCandidates(null)
    setPhotos([...photos, ...added])
  }

  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.url)
    urls.current = urls.current.filter((url) => url !== photo.url)
    setPhotos(photos.filter((p) => p.key !== photo.key))
    setNotice(null)
    setCandidates(null)
  }

  async function identify() {
    if (photos.length === 0 || busy) return
    const controller = new AbortController()
    request.current = controller
    setError(null)
    setNotice(null)
    setCandidates(null)
    try {
      setPhase('resizing')
      const files = await Promise.all(photos.map((photo) => downscaleImage(photo.file)))
      if (controller.signal.aborted) return
      setPhase('identifying')
      const body = new FormData()
      files.forEach((file) => body.append('images[]', file, file.name))
      const response = await api<PlantIdentificationResponse>(`/maps/${editor.map.id}/plant_identifications`, {
        method: 'POST', body, signal: controller.signal,
      })
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

  async function choose(candidate: PlantIdentificationCandidate) {
    if (!candidate.species) return
    // The server replaces the whole properties hash: keep the plant's own, set its species.
    const properties: Record<string, unknown> = { ...ownProperties(feature), species_id: candidate.species.id }
    delete properties.variety_id
    setSaving(true)
    try {
      await editor.updateFeature(featureId, { properties })
      editor.notify(t('plantnet.results.saved', { name: candidate.species.commonName ?? candidate.species.latinName }))
      reset()
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const explanationId = `plantnet-explanation-${featureId}`

  return (
    <section className="space-y-3 border-t border-loam-100 pt-3 text-sm" aria-labelledby={`plantnet-title-${featureId}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`plantnet-title-${featureId}`} className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('plantnet.section.title')}</h3>
        <HelpButton slug="identifier-une-plante" iconOnly label={t('plantnet.section.help')} />
      </div>

      {configured ? (
        <p className="text-xs text-loam-600">{t('plantnet.section.intro')}</p>
      ) : (
        <p id={explanationId} className="rounded-lg bg-humus-50 p-2 text-xs text-humus-700">{t('plantnet.section.not_configured')}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <PickButton icon={Camera} label={t('plantnet.section.take')} capture disabled={pickDisabled} describedBy={configured ? undefined : explanationId} onPick={addPhotos} />
        <PickButton icon={ImagePlus} label={t('plantnet.section.choose')} disabled={pickDisabled} describedBy={configured ? undefined : explanationId} onPick={addPhotos} />
      </div>

      {notice && <p className="text-xs text-humus-700" role="status">{notice}</p>}

      {photos.length > 0 && (
        <div className="space-y-2">
          <ul className="grid grid-cols-5 gap-1.5">
            {photos.map((photo, index) => (
              <li key={photo.key} className="relative aspect-square">
                <img src={photo.url} alt={t('plantnet.section.photo_alt', { index: index + 1 })} className="h-full w-full rounded-lg object-cover" />
                {!busy && (
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
          <p className="text-xs text-loam-400">{t('plantnet.section.count', { count: photos.length, max: MAX_PHOTOS })}</p>
          <Button className="w-full" onClick={identify} disabled={busy || !configured}>
            {phase === 'resizing' ? t('plantnet.section.resizing') : phase === 'identifying' ? t('plantnet.section.identifying') : t('plantnet.section.identify')}
          </Button>
        </div>
      )}

      <div ref={outcome} aria-live="polite" className="space-y-2">
        {error && <p className="rounded-lg bg-clay-50 p-2 text-xs text-clay-700" role="alert">{error}</p>}

        {candidates && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-loam-700">{t('plantnet.results.title')}</h4>
            {candidates.length === 0 ? (
              <p className="rounded-lg bg-loam-50 p-2 text-xs text-loam-600">{t('plantnet.results.empty')}</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {candidates.map((candidate) => (
                    <li key={candidate.latinName} className="rounded-lg bg-loam-50 p-2.5 text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 font-medium italic text-loam-900">{candidate.latinName}</p>
                        <span className="shrink-0 tabular-nums text-loam-600">{t('plantnet.results.score', { percent: candidate.percent })}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-loam-200" aria-hidden="true">
                        <div className="h-full rounded-full bg-leaf-600" style={{ width: `${candidate.percent}%` }} />
                      </div>
                      {candidate.commonNames.length > 0 && (
                        <p className="mt-1.5 text-loam-600">{t('plantnet.results.common_names', { names: candidate.commonNames.join(', ') })}</p>
                      )}
                      {candidate.family && <p className="text-loam-500">{t('plantnet.results.family', { family: candidate.family })}</p>}
                      {candidate.species ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="flex min-w-0 flex-1 basis-32 items-start gap-1 font-medium text-leaf-800">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{t('plantnet.results.in_catalogue', { name: candidate.species.commonName ?? candidate.species.latinName })}</span>
                          </p>
                          <Button variant="leaf" size="sm" className="shrink-0" disabled={saving} onClick={() => choose(candidate)}>{t('plantnet.results.choose')}</Button>
                        </div>
                      ) : (
                        <p className="mt-2 text-humus-700">{t('plantnet.results.not_in_catalogue')}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-loam-400">{t('plantnet.results.hint')}</p>
              </>
            )}
            <Button variant="secondary" size="sm" className="w-full" onClick={reset}>{candidates.length === 0 ? t('plantnet.results.retry') : t('plantnet.results.none')}</Button>
            <p className="text-xs text-loam-400">
              {t('plantnet.results.credit')}
              <a href="https://plantnet.org" target="_blank" rel="noreferrer" className="underline hover:text-loam-600">Pl@ntNet</a>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

/** A file picker that looks like a button: `capture` opens the camera on phones. */
function PickButton({ icon: Icon, label, capture, disabled, describedBy, onPick }: {
  icon: LucideIcon; label: string; capture?: boolean; disabled: boolean; describedBy?: string; onPick: (files: FileList | null) => void
}) {
  return (
    <label className={clsx('rounded-lg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-prune-600', disabled && 'pointer-events-none opacity-50')}>
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        multiple
        className="sr-only"
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => { onPick(e.target.files); e.target.value = '' }}
      />
      <span className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-sm font-medium text-loam-800 ring-1 ring-inset ring-loam-200 hover:bg-loam-100">
        <Icon className="h-4 w-4" aria-hidden="true" />{label}
      </span>
    </label>
  )
}
