import { Link } from '@inertiajs/react'
import { area as turfArea } from '@turf/turf'
import { Box, Download, Loader2, Lock, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, buttonClass } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { removeReliefOverlay, showReliefOverlay, type MapOverlayMode } from '@/relief/mapOverlay'
import { roofRainwater } from '@/relief/soil'
import { ChoiceGroup } from '@/relief/ui'
import type { MapFeature } from '@/types'
import type { ReliefOverview, WaterSettings } from '@/types/relief'

const POLL_MS = 3000
const ROOF_KINDS = new Set(['building'])

// The overlay chosen per map survives closing the panel (it stays on the map).
const overlayModes = new Map<number, MapOverlayMode>()

/** "Eau et relief": import the relief, open the 3D view, the key numbers and the roofs' rainwater. */
export default function ReliefPanel() {
  const editor = useEditor()
  if (!editor.entitlements.analyses) return <Upsell />
  return <ReliefPanelContent />
}

function Upsell() {
  return (
    <div className="space-y-3 rounded-xl bg-prune-50 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-prune-800">
        <Lock className="h-4 w-4" />
        {t('relief.upsell.title')}
      </p>
      <p className="text-loam-600">{t('relief.upsell.body')}</p>
      <a href="/tarifs" className={buttonClass('primary', 'sm')}>{t('relief.upsell.cta')}</a>
    </div>
  )
}

function ReliefPanelContent() {
  const editor = useEditor()
  const mapId = editor.map.id
  const [overview, setOverview] = useState<ReliefOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [upsell, setUpsell] = useState(false)
  const [busy, setBusy] = useState(false)
  const previousStatus = useRef<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api<ReliefOverview>(`/maps/${mapId}/terrain`, { signal })
      setOverview(data)
      setError(null)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      if (e instanceof ApiError && e.status === 402) setUpsell(true)
      else setError((e as Error).message)
    }
  }, [mapId])

  // Reload when the boundary changes (the grid preview depends on it).
  useEffect(() => {
    const abort = new AbortController()
    void load(abort.signal)
    return () => abort.abort()
  }, [load, editor.map.boundary])

  const status = overview?.terrain?.status ?? null
  const running = status === 'pending' || status === 'running'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [running, load])

  useEffect(() => {
    if (previousStatus.current && previousStatus.current !== 'ready' && status === 'ready') editor.notify(t('relief.panel_ui.imported'))
    previousStatus.current = status
  }, [status, editor])

  async function startImport() {
    setBusy(true)
    try {
      setOverview(await api<ReliefOverview>(`/maps/${mapId}/terrain`, { method: 'POST' }))
    } catch (e) {
      editor.notify((e as Error).message, 'error')
      void load()
    } finally {
      setBusy(false)
    }
  }

  if (upsell) return <Upsell />
  if (!overview) {
    return error
      ? <p className="text-sm text-clay-700">{error}</p>
      : <p className="flex items-center gap-2 text-sm text-loam-500"><Loader2 className="h-4 w-4 animate-spin" /></p>
  }

  const terrain = overview.terrain
  const ready = status === 'ready'
  const gridError = overview.grid && 'error' in overview.grid ? overview.grid.error : null
  const preview = overview.grid && !('error' in overview.grid) ? overview.grid : null

  return (
    <div className="space-y-5">
      <p className="text-sm text-loam-600">{t('relief.panel_ui.intro')}</p>

      <section className="space-y-3">
        {!overview.available ? (
          <p className="rounded-lg bg-loam-50 p-3 text-sm text-loam-600">{t('relief.panel_ui.unavailable', { region: editor.map.region.name })}</p>
        ) : !overview.hasBoundary ? (
          <p className="rounded-lg bg-loam-50 p-3 text-sm text-loam-600">{t('relief.panel_ui.no_boundary')}</p>
        ) : (
          <>
            <ImportStatus overview={overview} />
            {gridError && !ready && <p className="text-sm text-clay-700">{gridError}</p>}
            {!terrain && preview && (
              <p className="text-xs text-loam-500">
                {t('relief.panel_ui.grid_preview', {
                  cell: formatNumber(preview.cellSizeM), area: formatNumber(preview.areaKm2), margin: Math.round(preview.marginM),
                })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {ready && (
                <Link href={`/maps/${mapId}/relief`} className={buttonClass('primary', 'md', 'flex-1')}>
                  <Box className="h-4 w-4" />
                  {t('relief.panel_ui.open_3d')}
                </Link>
              )}
              {editor.canEdit && !running && !gridError && (
                <Button
                  variant={ready ? 'secondary' : 'primary'}
                  onClick={startImport}
                  disabled={busy}
                  className={ready ? '' : 'flex-1'}
                  title={ready ? t('relief.panel_ui.reimport') : undefined}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : ready ? <RotateCcw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  {ready ? (
                    <span className="sr-only sm:not-sr-only">{t('relief.panel_ui.reimport')}</span>
                  ) : status === 'failed' ? t('relief.panel_ui.retry') : t('relief.panel_ui.import')}
                </Button>
              )}
            </div>
            {!editor.canEdit && !ready && <p className="text-xs text-loam-500">{t('relief.panel_ui.viewer_hint')}</p>}
          </>
        )}
      </section>

      {ready && terrain && <KeyNumbers overview={overview} />}

      <Rainwater features={editor.features} settings={overview.settings} />

      {ready && overview.terrainGrid && <MapOverlay overview={overview} />}

      {editor.canEdit ? (
        <SettingsForm overview={overview} onSaved={setOverview} />
      ) : (
        <p className="text-xs text-loam-400">{t('relief.settings.limits')}</p>
      )}

      {ready && terrain && Object.keys(terrain.sources).length > 0 && (
        <p className="text-[0.7rem] leading-snug text-loam-400">
          {t('relief.panel_ui.sources', { sources: Object.values(terrain.sources).join(' · ') })}
        </p>
      )}
    </div>
  )
}

function ImportStatus({ overview }: { overview: ReliefOverview }) {
  const terrain = overview.terrain
  if (!terrain) return <p className="text-sm text-loam-700">{t('relief.panel_ui.not_imported')}</p>
  switch (terrain.status) {
    case 'pending':
    case 'running':
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-loam-800">
            <Loader2 className="h-4 w-4 animate-spin text-prune-600" />
            {terrain.status === 'pending' ? t('relief.panel_ui.pending') : t('relief.panel_ui.running', { progress: terrain.progress })}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-loam-100">
            <div className="h-full rounded-full bg-prune-500 transition-[width]" style={{ width: `${Math.max(3, terrain.progress)}%` }} />
          </div>
          <p className="text-xs text-loam-500">{t('relief.panel_ui.running_hint', { provider: overview.providerLabel ?? '' })}</p>
        </div>
      )
    case 'failed':
      return (
        <div className="rounded-lg bg-clay-50 p-3 text-sm">
          <p className="font-medium text-clay-700">{t('relief.panel_ui.failed')}</p>
          {terrain.error && <p className="mt-1 text-loam-700">{terrain.error}</p>}
        </div>
      )
    default:
      return (
        <div className="space-y-2">
          <p className="text-sm text-loam-700">
            {t('relief.panel_ui.ready', {
              date: terrain.fetchedAt ? new Date(terrain.fetchedAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—',
              cell: formatNumber(terrain.cellSizeM ?? 0),
            })}
          </p>
          {terrain.warnings.length > 0 && (
            <div className="rounded-lg bg-humus-50 p-2 text-xs text-humus-700">
              <p className="font-medium">{t('relief.panel_ui.warnings')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {terrain.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
        </div>
      )
  }
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-loam-50 p-3" title={hint}>
      <dt className="text-xs text-loam-500">{label}</dt>
      <dd className="font-medium tabular-nums text-loam-900">{value}</dd>
    </div>
  )
}

function KeyNumbers({ overview }: { overview: ReliefOverview }) {
  const stats = overview.terrain?.stats ?? {}
  const percent = (value: number | null | undefined) => (value == null ? '—' : `${formatNumber(Math.round(value))} %`)
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-loam-400">{t('relief.panel_ui.numbers')}</h3>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Stat
          label={t('relief.panel_ui.altitude')}
          value={stats.zMin != null && stats.zMax != null
            ? t('relief.panel_ui.altitude_range', { min: formatNumber(Math.round(stats.zMin)), max: formatNumber(Math.round(stats.zMax)) })
            : '—'}
        />
        <Stat label={t('relief.panel_ui.drop')} value={stats.drop != null ? `${formatNumber(stats.drop)} m` : '—'} />
        <Stat label={t('relief.panel_ui.slope_mean')} value={percent(stats.slopeMeanPct)} />
        <Stat label={t('relief.panel_ui.slope_steep')} value={percent(stats.slopeP90Pct)} hint={t('relief.panel_ui.slope_steep_hint')} />
      </dl>
    </section>
  )
}

/** Roofs' rainwater, live from the buildings drawn on the map. */
function Rainwater({ features, settings }: { features: MapFeature[]; settings: WaterSettings }) {
  const roofs = useMemo(() => {
    let areaM2 = 0
    let count = 0
    for (const feature of features) {
      const props = feature.properties
      if (!ROOF_KINDS.has(props.kind) || props.status !== 'active') continue
      if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue
      areaM2 += turfArea(feature)
      count += 1
    }
    return { areaM2, count }
  }, [features])
  const rain = settings.annualRainfallMm
  const volume = rain ? roofRainwater(roofs.areaM2, rain, settings.roofCoefficient) : null

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-loam-400">{t('relief.panel_ui.rainwater')}</h3>
      {roofs.count === 0 ? (
        <p className="text-sm text-loam-500">{t('relief.panel_ui.rainwater_none')}</p>
      ) : volume == null ? (
        <p className="text-sm text-loam-500">{t('relief.panel_ui.rainwater_no_rain')}</p>
      ) : (
        <div className="rounded-lg bg-sky-50 p-3 text-sm">
          <p className="text-lg font-semibold tabular-nums text-sky-900">{t('relief.panel_ui.rainwater_volume', { volume: formatNumber(Math.round(volume * 10) / 10) })}</p>
          <p className="text-xs text-sky-800">
            {t('relief.panel_ui.rainwater_detail', {
              area: formatArea(roofs.areaM2), rain: formatNumber(rain ?? 0), coefficient: formatNumber(settings.roofCoefficient),
            })}
          </p>
          <p className="mt-1 text-xs text-sky-700">
            {t('relief.panel_ui.rainwater_hint', { liters: formatNumber(Math.round((volume * 1000) / 52 / 10) * 10) })}
          </p>
        </div>
      )}
    </section>
  )
}

function MapOverlay({ overview }: { overview: ReliefOverview }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const grid = overview.terrainGrid!
  const [mode, setMode] = useState<MapOverlayMode>(() => overlayModes.get(mapId) ?? 'none')
  const [computing, setComputing] = useState(false)
  const [failed, setFailed] = useState(false)

  async function choose(next: MapOverlayMode) {
    setMode(next)
    overlayModes.set(mapId, next)
    setFailed(false)
    if (next === 'none') return removeReliefOverlay(editor.instance)
    setComputing(true)
    try {
      await showReliefOverlay(editor.instance, grid, next)
    } catch (e) {
      console.error(e)
      setFailed(true)
      overlayModes.set(mapId, 'none')
      removeReliefOverlay(editor.instance)
    } finally {
      setComputing(false)
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-loam-400">{t('relief.panel_ui.overlay')}</h3>
      <ChoiceGroup
        value={mode}
        onChange={(value) => void choose(value)}
        choices={(['none', 'flow', 'shade'] as const).map((value) => ({ value, label: t(`relief.panel_ui.overlay_${value}`) }))}
      />
      {computing ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-loam-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('relief.panel_ui.overlay_loading')}</p>
      ) : failed ? (
        <p className="mt-1 text-xs text-clay-700">{t('relief.panel_ui.overlay_failed')}</p>
      ) : mode !== 'none' ? (
        <p className="mt-1 text-xs text-loam-500">{t(`relief.panel_ui.overlay_${mode}_legend`)}</p>
      ) : null}
    </section>
  )
}

type SettingsDraft = { annualRainfallMm: string; roofCoefficient: string; soil: string; uniformRateMmH: string; storageMm: string }

const toDraft = (settings: WaterSettings): SettingsDraft => ({
  annualRainfallMm: settings.annualRainfallMm == null ? '' : String(settings.annualRainfallMm),
  roofCoefficient: String(settings.roofCoefficient),
  soil: settings.soil,
  uniformRateMmH: String(settings.uniformRateMmH),
  storageMm: String(settings.storageMm),
})

function SettingsForm({ overview, onSaved }: { overview: ReliefOverview; onSaved: (overview: ReliefOverview) => void }) {
  const editor = useEditor()
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(overview.settings))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const defaults = overview.defaults
  const set = (key: keyof SettingsDraft) => (event: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: event.target.value }))
  const defaultHint = (value: number | string | null) => (value == null || value === ''
    ? t('relief.settings.region_default_none')
    : t('relief.settings.region_default', { value: typeof value === 'number' ? formatNumber(value) : value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = await api<ReliefOverview>(`/maps/${editor.map.id}/water_settings`, {
        method: 'PATCH',
        body: {
          water_settings: {
            annual_rainfall_mm: draft.annualRainfallMm, roof_coefficient: draft.roofCoefficient, soil: draft.soil,
            uniform_rate_mm_h: draft.uniformRateMmH, storage_mm: draft.storageMm,
          },
        },
      })
      onSaved(data)
      setDraft(toDraft(data.settings))
      editor.notify(t('relief.settings.saved'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="group rounded-lg ring-1 ring-loam-200">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-loam-800">
        {t('relief.settings.title')}
        <span className="rounded bg-humus-100 px-1 py-px text-[0.65rem] font-medium uppercase tracking-wide text-humus-700">
          {t('relief.settings.indicative')}
        </span>
      </summary>
      <form onSubmit={submit} className="space-y-3 border-t border-loam-100 px-3 pb-3 pt-3">
        <Field label={t('relief.settings.annual_rainfall_mm')} hint={defaultHint(defaults.annualRainfallMm)}>
          <Input type="number" inputMode="numeric" min={100} max={5000} step={10} value={draft.annualRainfallMm} onChange={set('annualRainfallMm')} />
        </Field>
        <Field label={t('relief.settings.roof_coefficient')} hint={t('relief.settings.roof_coefficient_hint')}>
          <Input type="number" inputMode="decimal" min={0.1} max={1} step={0.05} value={draft.roofCoefficient} onChange={set('roofCoefficient')} />
        </Field>
        <Field label={t('relief.settings.soil')} hint={t('relief.settings.soil_hint')}>
          <Select value={draft.soil} onChange={set('soil')}>
            {overview.soils.map((soil) => <option key={soil} value={soil}>{t(`relief.soils.${soil}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('relief.settings.uniform_rate_mm_h')} hint={defaultHint(defaults.uniformRateMmH)}>
          <Input type="number" inputMode="decimal" min={0} max={500} step={1} value={draft.uniformRateMmH} onChange={set('uniformRateMmH')} />
        </Field>
        <Field label={t('relief.settings.storage_mm')} hint={defaultHint(defaults.storageMm)}>
          <Input type="number" inputMode="decimal" min={0} max={500} step={5} value={draft.storageMm} onChange={set('storageMm')} />
        </Field>
        <p className="text-xs text-loam-500">{t('relief.settings.limits')}</p>
        {error && <p className="text-xs text-clay-700">{error}</p>}
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('relief.settings.save')}
        </Button>
      </form>
    </details>
  )
}
