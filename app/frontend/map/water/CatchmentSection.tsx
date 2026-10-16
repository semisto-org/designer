import type { Geometry } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { Eye, EyeOff, Gauge, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { measure } from '@/map/editor/measure'
import type { MapFeature } from '@/types'

const KINDS = ['pond', 'swale', 'keyline', 'rain_garden', 'half_moon', 'check_dam', 'fascine', 'beaver_dam_analogue', 'hedge_bank']
// Structures across the flow: they slow water, they do not store a volume.
const ACROSS = new Set(['check_dam', 'fascine', 'beaver_dam_analogue', 'hedge_bank'])
// Above this catchment (m²), one structure alone takes too much water.
const SERIES_FROM_M2: Record<string, number> = { check_dam: 20_000, fascine: 5_000 }

/** Ponds, swales, rain gardens, half-moons and structures across the flow: what drains into them. */
export function appliesToCatchment(feature: MapFeature): boolean {
  return KINDS.includes(feature.properties.kind) && feature.properties.status !== 'rejected'
}

/** GET /maps/:id/relief/catchment (Relief::Catchment). */
export type CatchmentResult = {
  geometry: Geometry
  areaM2: number
  insideBoundaryM2: number
  beyondRelief: boolean
  cellSizeM: number
  capacityM3: number | null
  fillRainMm: number | null
  annualRainM3: number | null
  annualRainfallMm: number | null
  infiltrationMmH: number | null
  infiltrationDistanceM: number | null
  emptiesInH: number | null
}

type State = { status: 'loading' } | { status: 'ready'; result: CatchmentResult } | { status: 'error'; message: string; reason?: string }

const SOURCE = 'catchment'
const LAYERS = ['catchment-fill', 'catchment-line'] as const
const WATER = '#3d7ea6'

function install(map: MapLibreMap, geometry: Geometry) {
  const data = { type: 'Feature' as const, geometry, properties: {} }
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  // Under the drawn elements, so the pond stays readable on its catchment.
  const before = map.getLayer('features-fill') ? 'features-fill' : undefined
  map.addSource(SOURCE, { type: 'geojson', data })
  map.addLayer({ id: LAYERS[0], type: 'fill', source: SOURCE, paint: { 'fill-color': WATER, 'fill-opacity': 0.18 } }, before)
  map.addLayer({
    id: LAYERS[1], type: 'line', source: SOURCE,
    layout: { 'line-join': 'round' },
    paint: { 'line-color': WATER, 'line-width': 2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.85 },
  }, before)
}

function uninstall(map: MapLibreMap) {
  LAYERS.forEach((id) => map.getLayer(id) && map.removeLayer(id))
  if (map.getSource(SOURCE)) map.removeSource(SOURCE)
}

/** "about" figures: whole numbers from 10 up, tens from 1000 up. */
function about(value: number): string {
  if (value >= 1000) return formatNumber(Math.round(value / 10) * 10)
  if (value >= 10) return formatNumber(Math.round(value))
  return formatNumber(Math.round(value * 10) / 10)
}

/** How often the element fills, in words: the rain that fills it if it all runs off. */
function verdict(fillMm: number): string {
  if (fillMm < 15) return t('relief.catchment.verdict.overflows')
  if (fillMm <= 50) return t('relief.catchment.verdict.storms')
  return t('relief.catchment.verdict.slow')
}

/**
 * Inspector section « Bassin versant » of a pond, swale or rain garden: the
 * ground whose runoff ends up there, drawn on the map while the element is
 * selected, and what that means for its size and its overflow.
 */
export default function CatchmentSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const map = editor.instance
  const p = feature.properties
  const [state, setState] = useState<State>({ status: 'loading' })
  const [shown, setShown] = useState(true)
  const allowed = editor.entitlements.analyses

  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    api<CatchmentResult>(`/maps/${editor.map.id}/relief/catchment?feature_id=${p.id}`, { signal: controller.signal })
      .then((result) => setState({ status: 'ready', result }))
      .catch((error) => {
        if (controller.signal.aborted) return
        const reason = error instanceof ApiError ? (error.data.reason as string | undefined) : undefined
        setState({ status: 'error', message: (error as Error).message, reason })
      })
    return () => controller.abort()
  }, [allowed, editor.map.id, p.id, p.lockVersion])

  const geometry = state.status === 'ready' && shown ? state.result.geometry : null
  useEffect(() => {
    if (!geometry) return
    const timer = window.setTimeout(() => install(map, geometry), 0)
    const reinstall = () => { if (!map.getSource(SOURCE)) install(map, geometry) }
    map.on('styledata', reinstall)
    return () => {
      window.clearTimeout(timer)
      map.off('styledata', reinstall)
      uninstall(map)
    }
  }, [map, geometry])

  if (!allowed) return null

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
        <Waves className="h-4 w-4 text-[#3d7ea6]" />
        {t('relief.catchment.title')}
      </h3>
      {state.status === 'loading' && <p className="text-sm text-loam-500">{t('relief.catchment.loading')}</p>}
      {state.status === 'error' && (
        <p className="text-sm text-loam-600">
          {state.message}
          {state.reason === 'no_relief' && (
            <button type="button" onClick={() => editor.openPanel('relief')} className="ml-1 text-prune-700 underline-offset-2 hover:underline">
              {t('relief.catchment.open_relief')}
            </button>
          )}
        </p>
      )}
      {state.status === 'ready' && <Figures result={state.result} feature={feature} dug={!ACROSS.has(p.kind) && (p.kind !== 'keyline' || !p.use || p.use === 'swale')} />}
      {state.status === 'ready' && <SoilLine result={state.result} feature={feature} />}
      {state.status === 'ready' && (
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm text-prune-700 underline-offset-2 hover:underline"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {t(shown ? 'relief.catchment.hide' : 'relief.catchment.show')}
        </button>
      )}
    </section>
  )
}

function Figures({ result, feature, dug }: { result: CatchmentResult; feature: MapFeature; dug: boolean }) {
  const kind = feature.properties.kind
  const area = formatArea(result.areaM2)
  return (
    <div className="space-y-2 text-sm text-loam-700">
      <p>{t('relief.catchment.intro')}</p>
      <div className="rounded-lg bg-loam-50 p-3 text-loam-800">
        <p className="font-semibold tabular-nums">
          {t(result.beyondRelief ? 'relief.catchment.area_at_least' : 'relief.catchment.area', { area })}
        </p>
        {result.insideBoundaryM2 < result.areaM2 && (
          <p className="text-loam-600">{t('relief.catchment.inside', { area: formatArea(result.insideBoundaryM2) })}</p>
        )}
        {result.annualRainM3 != null && result.annualRainfallMm != null && (
          <p className="text-loam-600">
            {t('relief.catchment.annual', { volume: about(result.annualRainM3), rainfall: formatNumber(result.annualRainfallMm) })}
          </p>
        )}
      </div>
      {result.capacityM3 != null && result.fillRainMm != null && (
        <p>
          {t(`relief.catchment.holds.${kind}`, { volume: about(result.capacityM3) })}{' '}
          {t('relief.catchment.fills', { rain: formatNumber(result.fillRainMm) })}{' '}
          {verdict(result.fillRainMm)}
        </p>
      )}
      {result.capacityM3 == null && dug && <p className="text-loam-500">{t('relief.catchment.no_size')}</p>}
      {ACROSS.has(kind) && <p>{acrossAdvice(kind, result.areaM2, feature)}</p>}
      {result.beyondRelief && <p className="text-loam-500">{t('relief.catchment.beyond')}</p>}
    </div>
  )
}

/** What a structure across the flow should be, for the water that reaches it. */
export function acrossAdvice(kind: string, areaM2: number, feature: MapFeature): string {
  if (kind === 'hedge_bank') {
    const length = feature.geometry ? measure(feature.geometry).length : null
    return t('relief.catchment.across.hedge_bank', { per: formatArea(length ? areaM2 / length : areaM2) })
  }
  const limit = SERIES_FROM_M2[kind]
  if (limit == null) return t(`relief.catchment.across.${kind}`)
  return t(`relief.catchment.across.${kind}_${areaM2 > limit ? 'large' : 'small'}`)
}

function duration(hours: number): string {
  if (hours < 1) return t('relief.catchment.soil.minutes', { count: formatNumber(Math.max(5, Math.round(hours * 12) * 5)) })
  if (hours < 48) return t('relief.catchment.soil.hours', { count: formatNumber(Math.round(hours)) })
  return t('relief.catchment.soil.days', { count: formatNumber(Math.round(hours / 24)) })
}

/**
 * What the soil does with the water held here: how long a swale or rain
 * garden stays wet, whether a pond holds, from the person's infiltration
 * tests; without one, an invitation to measure, right here.
 */
function SoilLine({ result, feature }: { result: CatchmentResult; feature: MapFeature }) {
  const editor = useEditor()
  const rate = result.infiltrationMmH
  if (rate == null) {
    return (
      <div className="space-y-1.5 text-sm text-loam-700">
        <p>{t('relief.catchment.soil.unknown')}</p>
        {editor.canEdit && (
          <button
            type="button"
            onClick={async () => {
              editor.notify(t('relief.catchment.soil.measure_hint'))
              const geometry = await editor.draw('point')
              if (!geometry) return
              try {
                const created = await editor.createFeature({ layer: 'water', kind: 'infiltration_test', geometry })
                editor.select(created.properties.id)
              } catch (error) {
                editor.notify((error as Error).message, 'error')
              }
            }}
            className="inline-flex items-center gap-1.5 text-prune-700 underline-offset-2 hover:underline"
          >
            <Gauge className="h-4 w-4" />
            {t('relief.catchment.soil.measure')}
          </button>
        )}
      </div>
    )
  }
  const where = result.infiltrationDistanceM != null
    ? t('relief.catchment.soil.nearby', { rate: formatNumber(rate), distance: formatNumber(result.infiltrationDistanceM) })
    : t('relief.catchment.soil.map', { rate: formatNumber(rate) })
  if (feature.properties.kind === 'pond') {
    const key = rate < 2 ? 'pond_holds' : rate < 10 ? 'pond_clay' : 'pond_liner'
    return <p className="text-sm text-loam-700">{t(`relief.catchment.soil.${key}`, { where })}</p>
  }
  if (result.emptiesInH == null) return null
  return (
    <p className="text-sm text-loam-700">
      {t('relief.catchment.soil.empties', { where, duration: duration(result.emptiesInH) })}{' '}
      {t(result.emptiesInH > 48 ? 'relief.catchment.soil.empties_slow' : 'relief.catchment.soil.empties_ok')}
    </p>
  )
}
