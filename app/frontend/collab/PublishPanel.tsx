import { Check, Copy, ExternalLink, Globe, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, buttonClass } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { LAYER_COLORS } from '@/map/layers/features'
import type { PublicationData, PublicationOptions } from '@/types/collab'
import { formatDateTime } from './time'

/**
 * "Publier" (owner only): put a read-only view of the map at a shareable
 * address, readable without an account. The view is a snapshot taken when
 * publishing; networks and the exact address stay hidden unless the owner
 * decides otherwise.
 */
export default function PublishPanel() {
  const editor = useEditor()
  const base = `/maps/${editor.map.id}/publication`
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

  async function call(method: string, path = '', body?: unknown, success?: string) {
    setBusy(true)
    setError(null)
    try {
      adopt(await api<PublicationData>(base + path, { method, body }))
      if (success) editor.notify(success)
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
          <p className="flex items-center gap-1.5 text-sm font-medium text-leaf-800"><Globe className="h-4 w-4" />{t('collab.publish.live')}</p>
          <div className="flex gap-2">
            <Input id="publication-url" readOnly value={publication.url} onFocus={(e) => e.currentTarget.select()} aria-label={t('collab.publish.address')} className="min-w-0 flex-1 text-xs" />
            <Button variant="secondary" size="sm" onClick={() => void copy()} aria-label={t('collab.share.copy')}>
              {copied ? <Check className="h-4 w-4 text-leaf-600" /> : <Copy className="h-4 w-4" />}
            </Button>
            <a href={publication.url} target="_blank" rel="noopener" className={buttonClass('secondary', 'sm')} aria-label={t('collab.publish.open')} title={t('collab.publish.open')}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <p className="text-xs text-loam-600">
            {t('collab.publish.version', { version: publication.version, date: formatDateTime(publication.publishedAt) })}
          </p>
          {publication.stale && <p className="rounded bg-humus-50 px-2 py-1 text-xs text-humus-700">{t('collab.publish.stale')}</p>}
        </div>
      ) : (
        <p className="text-sm text-loam-600">
          {publication ? t('collab.publish.unpublished') : t('collab.publish.intro')}
        </p>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void call(publication ? 'PATCH' : 'POST', '', payload, t(live ? 'collab.publish.updated' : 'collab.publish.published'))
        }}
      >
        <Field label={t('collab.publish.title')}>
          <Input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('collab.publish.description')} hint={t('collab.publish.description_hint')}>
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

        <fieldset>
          <legend className="text-sm font-medium text-loam-700">{t('collab.publish.privacy')}</legend>
          <div className="mt-1 space-y-1.5">
            <Toggle checked={options.hide_networks} onChange={(v) => setOptions({ ...options, hide_networks: v })} label={t('collab.publish.hide_networks')} />
            <Toggle checked={options.hide_address} onChange={(v) => setOptions({ ...options, hide_address: v })} label={t('collab.publish.hide_address')} />
            <Toggle checked={options.show_notes} onChange={(v) => setOptions({ ...options, show_notes: v })} label={t('collab.publish.show_notes')} />
          </div>
          <p className="mt-1 text-xs text-loam-400">{t('collab.publish.privacy_hint')}</p>
        </fieldset>

        <div className="sticky -bottom-4 -mx-4 space-y-1 border-t border-loam-100 bg-white px-4 py-3">
          <Button type="submit" className="w-full" disabled={busy || title.trim() === ''}>
            <Globe className="h-4 w-4" />
            {live ? t('collab.publish.update') : t('collab.publish.publish')}
          </Button>
          {live && <p className="text-xs text-loam-400">{t('collab.publish.snapshot_hint')}</p>}
        </div>
      </form>

      {live && (
        <div className="flex flex-wrap gap-2 border-t border-loam-100 pt-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => { if (window.confirm(t('collab.publish.unpublish_confirm'))) void call('DELETE', '', undefined, t('collab.publish.unpublished_done')) }}
          >
            {t('collab.publish.unpublish')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => { if (window.confirm(t('collab.publish.renew_confirm'))) void call('POST', '/renew', undefined, t('collab.publish.renewed')) }}
          >
            <RefreshCw className="h-4 w-4" />
            {t('collab.publish.renew')}
          </Button>
        </div>
      )}
      {!live && publication && (
        <p className="text-xs text-loam-400">{t('collab.publish.republish_hint')}</p>
      )}
    </div>
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
