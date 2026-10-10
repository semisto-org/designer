import clsx from 'clsx'
import { Bot, Camera, Check, Copy, ImagePlus, Loader2, MapPinOff, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { photoUrl } from '@/map/photos/format'
import { photoActions, usePhotos } from '@/map/photos/store'
import { uploadActions, useUploads } from '@/map/photos/upload'
import { IndicatorChips } from '@/map/soil/IndicatorChips'
import { PickButton } from '@/map/soil/PhotoObservation'
import { soilActions, useSoil } from '@/map/soil/store'
import type { BioObservation, MapPhotoData } from '@/types/soil_photos'

/**
 * « Faire lire une photo par ton IA »: a photo of a patch of ground, with all
 * its wild plants, is left for the person's own AI. Through the MCP, the AI
 * looks at the whole photo and proposes each plant it sees as a draft; the
 * person keeps what they recognise too. Designer itself calls no AI.
 */
export default function AiPhotoReading() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { aiPhotos, observations } = useSoil()
  const { photos: mapPhotos } = usePhotos()
  const [keys, setKeys] = useState<string[]>([])
  const uploads = useUploads().filter((item) => keys.includes(item.key))
  const sending = uploads.some((item) => item.status === 'pending' || item.status === 'uploading')

  // Once a batch is sent, the list comes back from the server; sent items leave, failures stay with their reason.
  useEffect(() => {
    if (keys.length === 0 || sending) return
    soilActions.loadObservations(mapId)
    uploads.filter((item) => item.status === 'done' || item.status === 'duplicate').forEach((item) => uploadActions.dismiss(item.key))
    setKeys(uploads.filter((item) => item.status === 'error').map((item) => item.key))
  }, [sending]) // eslint-disable-line react-hooks/exhaustive-deps

  // A photo placed on the map (photos store) has its position before the list is reloaded.
  const current = (photo: MapPhotoData) => mapPhotos.find((p) => p.id === photo.id) ?? photo
  const waiting = aiPhotos.filter((p) => p.bioindicatorStatus === 'to_analyze').map(current)
  const read = aiPhotos.filter((p) => p.bioindicatorStatus === 'analyzed').map(current)
  const drafts = observations.filter((o) => o.status === 'draft')
  const reviewed = read.filter((photo) => drafts.some((d) => d.photoId === photo.id))
  const done = read.filter((photo) => !drafts.some((d) => d.photoId === photo.id))

  async function send(files: FileList | null, fromCamera: boolean) {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    await photoActions.load(mapId)
    const added = uploadActions.add(mapId, list, { bioindicatorStatus: 'to_analyze', useDevicePosition: fromCamera })
    setKeys((previous) => [...previous, ...added])
  }

  if (!editor.canEdit && aiPhotos.length === 0) return null

  return (
    <section className="space-y-3 rounded-xl bg-prune-50 p-3.5" aria-labelledby="bioindicator-ai-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="bioindicator-ai-title" className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
          <Bot className="h-4 w-4 text-prune-600" aria-hidden />{t('soil.plants.ai.title')}
        </h3>
        <HelpButton slug="analyser-son-sol" iconOnly label={t('soil.plants.photo.help')} />
      </div>
      {editor.canEdit && (
        <>
          <p className="text-xs text-loam-600">{t('soil.plants.ai.intro')}</p>
          <div className="grid grid-cols-2 gap-2">
            <PickButton icon={Camera} label={t('soil.plants.ai.take')} capture disabled={false} onPick={(files) => send(files, true)} />
            <PickButton icon={ImagePlus} label={t('soil.plants.ai.choose')} disabled={false} onPick={(files) => send(files, false)} />
          </div>
        </>
      )}

      {uploads.length > 0 && (
        <ul className="space-y-1" aria-live="polite">
          {uploads.map((item) => (
            <li key={item.key} className={clsx('flex items-center gap-2 text-xs', item.status === 'error' ? 'text-clay-700' : 'text-loam-600')}>
              {item.status === 'error' ? <X className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
              <span className="min-w-0 flex-1">{item.status === 'error' ? item.message : t('soil.plants.ai.sending', { name: item.name })}</span>
              {item.status === 'error' && (
                <button type="button" className="rounded p-0.5 hover:bg-clay-50" aria-label={t('common.close')} onClick={() => { uploadActions.dismiss(item.key); setKeys((k) => k.filter((key) => key !== item.key)) }}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {waiting.length > 0 && <Waiting photos={waiting} />}
      {reviewed.map((photo) => <PhotoReview key={photo.id} photo={photo} drafts={drafts.filter((d) => d.photoId === photo.id)} />)}

      {done.length > 0 && (
        <details className="text-xs text-loam-600">
          <summary className="cursor-pointer font-medium text-loam-700">{t('soil.plants.ai.read_title', { count: done.length })}</summary>
          <ul className="mt-2 space-y-2">
            {done.map((photo) => (
              <li key={photo.id} className="flex gap-2">
                <Thumb photo={photo} />
                <p className="min-w-0 flex-1 whitespace-pre-line">{photo.bioindicatorSummary}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** The photos waiting for the AI, and the sentence to say to it. */
function Waiting({ photos }: { photos: MapPhotoData[] }) {
  const editor = useEditor()
  const prompt = t('soil.plants.ai.prompt', { map: editor.map.name ?? '' })
  const [copied, setCopied] = useState(false)
  const unplaced = photos.some((p) => p.lng == null || p.lat == null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-loam-700">{t('soil.plants.ai.waiting_title', { count: photos.length })}</h4>
      <ul className="flex flex-wrap gap-1.5">
        {photos.map((photo) => (
          <li key={photo.id} className="relative">
            <Thumb photo={photo} />
            {(photo.lng == null || photo.lat == null) && editor.canEdit && (
              <button
                type="button" onClick={() => photoActions.startPlacing(photo.id)}
                className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 rounded-b-lg bg-humus-600/90 py-0.5 text-[10px] font-medium text-white hover:bg-humus-700"
              >
                <MapPinOff className="h-3 w-3" aria-hidden />{t('soil.plants.ai.place')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {unplaced && editor.canEdit && <p className="text-xs text-humus-700">{t('soil.plants.ai.not_placed')}</p>}
      <div className="space-y-1.5 rounded-lg bg-white p-2.5 ring-1 ring-prune-100">
        <p className="text-xs font-medium text-loam-700">{t('soil.plants.ai.ask')}</p>
        <p className="text-sm text-loam-900">« {prompt} »</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <Check className="h-4 w-4 text-leaf-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? t('soil.plants.ai.copied') : t('soil.plants.ai.copy')}
          </Button>
          <a href="/account/ai" className="text-xs font-medium text-prune-700 hover:underline" title={t('soil.plants.ai.connect')}>{t('soil.plants.ai.connect_link')}</a>
        </div>
      </div>
    </div>
  )
}

/** One photo the AI read: what it says about the soil, and the plants it proposes, kept or refused one by one. */
function PhotoReview({ photo, drafts }: { photo: MapPhotoData; drafts: BioObservation[] }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const [busy, setBusy] = useState(false)
  const ordered = useMemo(() => [...drafts].sort((a, b) => rank(a) - rank(b)), [drafts])

  async function act(ids: number[], keep: boolean) {
    setBusy(true)
    try {
      if (keep) {
        await soilActions.acceptObservations(mapId, ids)
        editor.notify(t('soil.plants.ai.kept', { count: ids.length }))
      } else {
        await soilActions.refuseObservations(mapId, ids)
        editor.notify(t('soil.plants.ai.refused'))
      }
    } catch (e) {
      editor.notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="space-y-2 rounded-lg bg-white p-2.5 ring-1 ring-prune-100">
      <div className="flex gap-2">
        <Thumb photo={photo} />
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-xs font-semibold text-loam-700">{t('soil.plants.ai.review_title')}</h4>
          {photo.bioindicatorSummary && <p className="whitespace-pre-line text-xs text-loam-700">{photo.bioindicatorSummary}</p>}
        </div>
      </div>
      {editor.canEdit && <p className="text-[11px] text-loam-500">{t('soil.plants.ai.review_hint')}</p>}
      <ul className="space-y-1.5">
        {ordered.map((draft) => (
          <li key={draft.id} className="space-y-1 rounded-lg border border-dashed border-prune-200 p-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-loam-900">{draft.speciesName}</p>
                {draft.latinName && <p className="italic text-loam-500">{draft.latinName}</p>}
              </div>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                {draft.confidence && <span className={clsx('rounded-full px-2 py-0.5 font-medium', CONFIDENCE_STYLE[draft.confidence])}>{t(`soil.plants.ai.confidence.${draft.confidence}`)}</span>}
                <span className="text-loam-500">{t(`soil.abundances.${draft.abundance}`)}</span>
              </span>
            </div>
            <IndicatorChips keys={draft.indicators} unverified={draft.unverified} />
            {draft.rationale && <p className="text-loam-600">{draft.rationale}</p>}
            {editor.canEdit && (
              <div className="flex gap-2 pt-0.5">
                <Button size="sm" variant="leaf" disabled={busy} onClick={() => act([draft.id], true)}><Check className="h-3.5 w-3.5" aria-hidden />{t('soil.plants.ai.keep')}</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act([draft.id], false)}><X className="h-3.5 w-3.5" aria-hidden />{t('soil.plants.ai.refuse')}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editor.canEdit && drafts.length > 1 && (
        <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={() => act(drafts.map((d) => d.id), true)}>
          {t('soil.plants.ai.keep_all')}
        </Button>
      )}
    </article>
  )
}

const CONFIDENCE_STYLE = { high: 'bg-leaf-100 text-leaf-800', medium: 'bg-loam-100 text-loam-700', low: 'bg-humus-100 text-humus-800' } as const
const rank = (o: BioObservation) => ({ high: 0, medium: 1, low: 2 })[o.confidence ?? 'low']

function Thumb({ photo }: { photo: MapPhotoData }) {
  const editor = useEditor()
  async function open() {
    await photoActions.load(editor.map.id)
    photoActions.open(photo.id)
  }
  return (
    <button type="button" onClick={open} className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg" aria-label={t('soil.plants.ai.open_photo')}>
      <img src={photoUrl(editor.map.id, photo.id, 'thumb')} alt="" loading="lazy" className="h-full w-full object-cover" />
    </button>
  )
}
