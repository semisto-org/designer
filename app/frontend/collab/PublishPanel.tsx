import { Camera, Check, Copy, Download, ExternalLink, FileText, FlaskConical, Film, Globe, Loader2, Lock, RefreshCw, Sprout } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, buttonClass } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { aerialViewLabel } from '@/drone/format'
import { ApiError, api } from '@/lib/api'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { LAYER_COLORS } from '@/map/layers/features'
import type { DeliverableCounts, PublicMapProps, PublicationData, PublicationOptions } from '@/types/collab'
import { formatDateTime } from './time'

/**
 * "Publier": the two publications of a map, side by side. « Plan public »
 * (owner only) puts a read-only view of the map at a shareable address,
 * readable without an account; « Livrable client » (Pro and Team, see
 * collab/DeliverablePanel) the client's project file at a private link.
 * Each is a snapshot taken when publishing; networks and the exact address
 * stay hidden unless the owner decides otherwise.
 */
export default function PublishPanel() {
  return <PublicationTabs initial="public" />
}

/** The tabs this person may use; one tab alone shows no switch. */
export function PublicationTabs({ initial }: { initial: PublicationKind }) {
  const editor = useEditor()
  const kinds: PublicationKind[] = []
  if (editor.isOwner) kinds.push('public')
  if (editor.offerBuilder && editor.canEdit) kinds.push('deliverable')
  const [kind, setKind] = useState<PublicationKind>(kinds.includes(initial) ? initial : (kinds[0] ?? initial))
  return (
    <div className="space-y-4">
      {kinds.length > 1 && (
        <Segmented
          className="w-full"
          label={t('collab.publish.tabs_label')}
          value={kind}
          onChange={setKind}
          options={kinds.map((k) => ({ value: k, label: t(`collab.publish.tabs.${k}`) }))}
        />
      )}
      <PublicationPanel key={kind} kind={kind} />
    </div>
  )
}

export type PublicationKind = 'public' | 'deliverable'

// Wordings the client deliverable says its own way; every other one is shared.
const DELIVERABLE_WORDS = new Set([
  'intro', 'live', 'unpublished', 'published', 'updated', 'update', 'publish', 'snapshot_hint',
  'unpublish_confirm', 'renew_confirm', 'title', 'address', 'open', 'description', 'description_hint', 'stale', 'unpublished_done', 'republish_hint',
])

/**
 * The form behind « Publier » and « Livrable client » (collab/DeliverablePanel):
 * the same snapshot of the plan, at a public address or at the client's
 * private one. The deliverable adds the files the team marked for it, and
 * leaves out the link preview, the video and the gallery.
 */
export function PublicationPanel({ kind }: { kind: PublicationKind }) {
  const editor = useEditor()
  const deliverable = kind === 'deliverable'
  const base = `/maps/${editor.map.id}/${deliverable ? 'deliverable' : 'publication'}`
  const w = (key: string) => (deliverable && DELIVERABLE_WORDS.has(key) ? `deliverables.panel.${key}` : `collab.publish.${key}`)
  const [data, setData] = useState<PublicationData | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState<PublicationOptions | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const adopt = useCallback((next: PublicationData) => {
    setData(next)
    setTitle(next.publication?.title ?? next.defaults.title)
    setDescription(next.publication?.description ?? '')
    setOptions(next.publication?.options ?? next.defaults.options)
  }, [])

  useEffect(() => {
    api<PublicationData>(base).then(adopt).catch(() => setError(t('collab.publish.load_error')))
  }, [base, adopt])

  // After publishing: paint the link preview from what the public view
  // shows, and send it. Silent on failure: the site's image stays.
  async function paintPreview(next: PublicationData) {
    if (!next.publicProps || !next.publication?.live) return
    try {
      const { renderPreview } = await import('@/public_maps/preview')
      const blob = await renderPreview(next.publicProps)
      if (!blob) return
      const form = new FormData()
      form.append('image', blob, 'preview.png')
      const { previewPath } = await api<{ previewPath: string | null }>(`${base}/preview`, { method: 'POST', body: form })
      setData((current) => current?.publication ? { ...current, publication: { ...current.publication, previewPath } } : current)
    } catch {
      // The generic image of the site is used instead.
    }
  }

  async function call(method: string, path = '', body?: unknown, success?: string) {
    setBusy(true)
    setError(null)
    try {
      const next = await api<PublicationData>(base + path, { method, body })
      adopt(next)
      if (success) editor.notify(success)
      if (next.publicProps) {
        track(deliverable ? 'deliverable_publish' : 'publish', { first: method === 'POST' })
        if (!deliverable) void paintPreview(next)
      }
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : t('collab.publish.error'))
    } finally {
      setBusy(false)
    }
  }

  const payload = { publication: { title, description, options } }

  if (!data || !options) return <p className="text-sm text-loam-500">{error ?? t('common.loading')}</p>
  const publication = data.publication
  const live = publication?.live ?? false
  // Without Pro or Team: a deliverable already published stays readable, it can no longer be refreshed.
  const locked = deliverable && data.entitled === false

  const toggleIn = (key: 'feature_layers' | 'region_layers', value: string, on: boolean) =>
    setOptions((o) => o && { ...o, [key]: on ? [...new Set([...o[key], value])] : o[key].filter((v) => v !== value) })
  const bases = data.regionLayers.filter((l) => l.category === 'base')
  const overlays = data.regionLayers.filter((l) => l.category === 'overlay')
  const chosenBase = bases.find((l) => options.region_layers.includes(l.key))?.key ?? ''

  async function copy() {
    if (!publication) return
    try {
      await navigator.clipboard.writeText(publication.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      document.querySelector<HTMLInputElement>('#publication-url')?.select()
    }
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700">{error}</p>}

      {live && publication ? (
        <div className="space-y-3 rounded-lg bg-leaf-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-leaf-800"><Globe className="h-4 w-4" />{t(w('live'))}</p>
          <div className="flex gap-2">
            <Input id="publication-url" readOnly value={publication.url} onFocus={(e) => e.currentTarget.select()} aria-label={t(w('address'))} className="min-w-0 flex-1 text-xs" />
            <Button variant="secondary" size="sm" onClick={() => void copy()} aria-label={t('collab.share.copy')}>
              {copied ? <Check className="h-4 w-4 text-leaf-600" /> : <Copy className="h-4 w-4" />}
            </Button>
            <a href={publication.url} target="_blank" rel="noopener" className={buttonClass('secondary', 'sm')} aria-label={t(w('open'))} title={t(w('open'))}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <p className="text-xs text-loam-600">
            {t('collab.publish.version', { version: publication.version, date: formatDateTime(publication.publishedAt) })}
          </p>
          {(publication.views ?? 0) > 0 && (
            <p className="flex items-start gap-1.5 text-sm text-leaf-800">
              <Sprout className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {audience(publication.views ?? 0, publication.gardensStarted ?? 0)}
            </p>
          )}
          {publication.stale && <p className="rounded bg-humus-50 px-2 py-1 text-xs text-humus-700">{t(w('stale'))}</p>}
          {!deliverable && publication.previewPath && (
            <figure className="space-y-1">
              <img src={publication.previewPath} alt={t('collab.publish.preview')} width={1200} height={630} className="w-full rounded-lg ring-1 ring-loam-200" />
              <figcaption className="text-sm text-loam-600">{t('collab.publish.preview_hint')}</figcaption>
            </figure>
          )}
          {!deliverable && <GardenVideo base={base} url={publication.url} />}
        </div>
      ) : (
        <p className="text-sm text-loam-600">
          {publication ? t(w('unpublished')) : t(w('intro'))}
        </p>
      )}

      {deliverable && data.contents && <DeliverableContents mapId={editor.map.id} counts={data.contents} />}

      {locked ? (
        <div className="space-y-2 rounded-lg bg-prune-50 p-3 text-sm text-prune-800">
          <p className="flex items-center gap-1.5 font-medium"><Lock className="h-4 w-4" aria-hidden />{t('deliverables.panel.locked_title')}</p>
          <p>{t(live ? 'deliverables.panel.locked_live' : 'deliverables.panel.locked')}</p>
          <a href="/tarifs" className={buttonClass('secondary', 'sm')}>{t('deliverables.panel.see_plans')}</a>
        </div>
      ) : (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void call(publication ? 'PATCH' : 'POST', '', payload, t(w(live ? 'updated' : 'published')))
        }}
      >
        <Field label={t(w('title'))}>
          <Input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t(w('description'))} hint={t(w('description_hint'))}>
          <Textarea rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium text-loam-700">{t('collab.publish.feature_layers')}</legend>
          <div className="mt-1 space-y-1">
            {data.featureLayers.map(({ key, count }) => {
              const isNetwork = key === 'networks'
              const hidden = isNetwork && options.hide_networks
              return (
                <label key={key} className={'flex items-center gap-2 text-sm ' + (hidden ? 'text-loam-400' : 'text-loam-700')}>
                  <input
                    type="checkbox"
                    className="rounded border-loam-300 text-prune-600"
                    checked={!hidden && options.feature_layers.includes(key)}
                    disabled={hidden}
                    onChange={(e) => toggleIn('feature_layers', key, e.target.checked)}
                  />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[key] }} />
                  {t(`editor.layers.${key}`)}
                  <span className="text-xs text-loam-400">{count}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {data.regionLayers.length > 0 && (
          <fieldset>
            <legend className="text-sm font-medium text-loam-700">{t('collab.publish.region_layers')}</legend>
            <div className="mt-1 space-y-1">
              {bases.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-loam-700">
                  {t('collab.publish.base')}
                  <select
                    className="rounded-lg border-0 bg-white py-1 pl-2 pr-8 text-sm ring-1 ring-inset ring-loam-200"
                    value={chosenBase}
                    onChange={(e) => setOptions((o) => o && { ...o, region_layers: [...o.region_layers.filter((k) => !bases.some((b) => b.key === k)), ...(e.target.value ? [e.target.value] : [])] })}
                  >
                    <option value="">{t('collab.publish.base_none')}</option>
                    {bases.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
                  </select>
                </label>
              )}
              {overlays.map((layer) => {
                const hidden = layer.sensitive && options.hide_networks
                return (
                  <label key={layer.key} className={'flex items-center gap-2 text-sm ' + (hidden ? 'text-loam-400' : 'text-loam-700')}>
                    <input
                      type="checkbox"
                      className="rounded border-loam-300 text-prune-600"
                      checked={!hidden && options.region_layers.includes(layer.key)}
                      disabled={hidden}
                      onChange={(e) => toggleIn('region_layers', layer.key, e.target.checked)}
                    />
                    {layer.name}
                    {layer.sensitive && <span className="text-xs text-loam-400">{t('collab.publish.sensitive')}</span>}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}

        {data.aerialView && (
          <fieldset>
            <legend className="text-sm font-medium text-loam-700">{t('drone.publish.legend')}</legend>
            <div className="mt-1">
              <Toggle checked={options.show_aerial_view ?? false} onChange={(v) => setOptions({ ...options, show_aerial_view: v })} label={t('drone.publish.show', { label: aerialViewLabel(data.aerialView) })} />
            </div>
            <p className="mt-1 text-xs text-loam-400">{t('drone.publish.hint')}</p>
          </fieldset>
        )}

        <fieldset>
          <legend className="text-sm font-medium text-loam-700">{t('collab.publish.situation')}</legend>
          <div className="mt-1">
            <Toggle checked={options.show_planned ?? false} onChange={(v) => setOptions({ ...options, show_planned: v })} label={t('collab.publish.show_planned')} />
          </div>
          <p className="mt-1 text-sm text-loam-500">{t(options.show_planned ? 'collab.publish.show_planned_on' : 'collab.publish.show_planned_off')}</p>
          <div className="mt-2">
            <Toggle checked={options.show_sectors ?? false} onChange={(v) => setOptions({ ...options, show_sectors: v })} label={t('collab.publish.show_sectors')} />
          </div>
          <p className="mt-1 text-sm text-loam-500">{t('collab.publish.show_sectors_hint')}</p>
          <div className="mt-2">
            <Toggle checked={options.show_growth ?? true} onChange={(v) => setOptions({ ...options, show_growth: v })} label={t('collab.publish.show_growth')} />
          </div>
          <p className="mt-1 text-sm text-loam-500">{t('collab.publish.show_growth_hint')}</p>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-loam-700">{t('collab.publish.privacy')}</legend>
          <div className="mt-1 space-y-1.5">
            <Toggle checked={options.hide_networks} onChange={(v) => setOptions({ ...options, hide_networks: v })} label={t('collab.publish.hide_networks')} />
            <Toggle checked={options.hide_address} onChange={(v) => setOptions({ ...options, hide_address: v })} label={t('collab.publish.hide_address')} />
            <Toggle checked={options.show_notes} onChange={(v) => setOptions({ ...options, show_notes: v })} label={t('collab.publish.show_notes')} />
            <Toggle checked={options.show_zone_names ?? false} onChange={(v) => setOptions({ ...options, show_zone_names: v })} label={t('collab.publish.show_zone_names')} />
          </div>
          <p className="mt-1 text-xs text-loam-400">{t('collab.publish.privacy_hint')}</p>
        </fieldset>

        {!deliverable && (
        <fieldset>
          <legend className="text-sm font-medium text-loam-700">{t('collab.publish.gallery')}</legend>
          <div className="mt-1">
            <Toggle checked={options.in_gallery ?? false} onChange={(v) => setOptions({ ...options, in_gallery: v })} label={t('collab.publish.in_gallery')} />
          </div>
          <p className="mt-1 text-sm text-loam-500">{t('collab.publish.gallery_hint')}</p>
        </fieldset>
        )}

        <div className="sticky -bottom-4 -mx-4 space-y-1 border-t border-loam-100 bg-white px-4 py-3">
          <Button type="submit" className="w-full" disabled={busy || title.trim() === ''}>
            <Globe className="h-4 w-4" />
            {live ? t(w('update')) : t(w('publish'))}
          </Button>
          {live && <p className="text-xs text-loam-400">{t(w('snapshot_hint'))}</p>}
        </div>
      </form>
      )}

      {live && (
        <div className="flex flex-wrap gap-2 border-t border-loam-100 pt-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void confirmAction({ title: t(w('unpublish_confirm')), tone: 'danger' }).then((ok) => { if (ok) void call('DELETE', '', undefined, t(w('unpublished_done'))) })}
          >
            {t('collab.publish.unpublish')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void confirmAction({ title: t(w('renew_confirm')) }).then((ok) => { if (ok) void call('POST', '/renew', undefined, t('collab.publish.renewed')) })}
          >
            <RefreshCw className="h-4 w-4" />
            {t('collab.publish.renew')}
          </Button>
        </div>
      )}
      {!live && publication && (
        <p className="text-xs text-loam-400">{t(w('republish_hint'))}</p>
      )}
    </div>
  )
}

/**
 * What the client finds beside the plan: the files the team marked « Dans
 * le livrable », read live, with where to mark more.
 */
function DeliverableContents({ mapId, counts }: { mapId: number; counts: DeliverableCounts }) {
  const rows = [
    { icon: FileText, count: counts.documents, label: t('deliverables.panel.documents', { count: counts.documents }), href: `/maps/${mapId}/documents` },
    { icon: Camera, count: counts.photos + counts.videos, label: counts.videos > 0 ? `${t('deliverables.panel.photos', { count: counts.photos })} · ${t('deliverables.panel.videos', { count: counts.videos })}` : t('deliverables.panel.photos', { count: counts.photos }), href: `/maps/${mapId}/photos` },
    { icon: FlaskConical, count: counts.soilSamples, label: t('deliverables.panel.soil', { count: counts.soilSamples }), href: null },
  ]
  return (
    <section className="space-y-2 rounded-lg bg-loam-50 p-3">
      <h3 className="text-sm font-medium text-loam-800">{t('deliverables.panel.contents_title')}</h3>
      <ul className="space-y-1.5">
        {rows.map(({ icon: Icon, count, label, href }) => (
          <li key={label} className={'flex items-center gap-2 text-sm ' + (count > 0 ? 'text-loam-800' : 'text-loam-500')}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {href ? <a href={href} className="hover:text-prune-700 hover:underline">{label}</a> : <span>{label}</span>}
          </li>
        ))}
      </ul>
      <p className="text-sm text-loam-600">{t('deliverables.panel.contents_hint')}</p>
    </section>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-loam-700">
      <input type="checkbox" className="rounded border-loam-300 text-prune-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** « 31 personnes ont regardé ton jardin, 2 ont commencé le leur. » */
function audience(views: number, started: number) {
  const seen = t('collab.publish.audience.views', { count: views })
  return started > 0 ? t('collab.publish.audience.both', { seen, started: t('collab.publish.audience.started', { count: started }) }) : `${seen}.`
}

type VideoState =
  | { status: 'idle' }
  | { status: 'painting'; percent: number }
  | { status: 'done'; href: string; filename: string }
  | { status: 'error'; message: string }

/**
 * « Mon jardin dans 30 ans »: the public view as a vertical video, painted
 * and recorded here (public_maps/video.ts), then downloaded.
 */
function GardenVideo({ base, url }: { base: string; url: string }) {
  const [state, setState] = useState<VideoState>({ status: 'idle' })
  const [supported] = useState(() => typeof MediaRecorder !== 'undefined')

  useEffect(() => () => {
    if (state.status === 'done') URL.revokeObjectURL(state.href)
  }, [state])

  async function paint() {
    setState({ status: 'painting', percent: 0 })
    try {
      const [{ renderGardenVideo, videoSupported }, data] = await Promise.all([
        import('@/public_maps/video'),
        api<PublicationData & { publicProps?: PublicMapProps }>(`${base}?public=1`),
      ])
      if (!videoSupported()) return setState({ status: 'error', message: t('collab.publish.video.unsupported') })
      const props = data.publicProps
      if (!props?.growth) return setState({ status: 'error', message: t('collab.publish.video.no_plants') })
      const address = url.replace(/^https?:\/\//, '')
      const video = await renderGardenVideo(props, address, (done) => setState({ status: 'painting', percent: Math.round(done * 100) }))
      if (!video) return setState({ status: 'error', message: t('collab.publish.video.no_plants') })
      const filename = `${props.token.replace(/-[a-z0-9]{14}$/, '')}-dans-30-ans.${video.extension}`
      setState({ status: 'done', href: URL.createObjectURL(video.blob), filename })
      track('video_painted', { format: video.extension })
    } catch {
      setState({ status: 'error', message: t('collab.publish.video.failed') })
    }
  }

  return (
    <section className="space-y-2 border-t border-leaf-100 pt-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-leaf-800"><Film className="h-4 w-4" aria-hidden="true" />{t('collab.publish.video.title')}</p>
      <p className="text-sm text-loam-600">{supported ? t('collab.publish.video.hint') : t('collab.publish.video.unsupported')}</p>
      {state.status === 'painting' && (
        <p className="flex items-center gap-2 text-sm text-loam-700" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('collab.publish.video.painting', { percent: state.percent })}
        </p>
      )}
      {state.status === 'error' && <p className="text-sm text-clay-700" role="alert">{state.message}</p>}
      <div className="flex flex-wrap gap-2">
        {state.status === 'done' && (
          <a href={state.href} download={state.filename} onClick={() => track('video_download')} className={buttonClass('primary', 'sm')}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('collab.publish.video.download')}
          </a>
        )}
        {supported && state.status !== 'painting' && (
          <Button variant="secondary" size="sm" onClick={() => void paint()}>
            {state.status === 'done' ? t('collab.publish.video.again') : t('collab.publish.video.make')}
          </Button>
        )}
      </div>
    </section>
  )
}
