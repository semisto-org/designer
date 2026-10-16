import type { Geometry } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { Eye, EyeOff, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'

const KINDS = ['pond', 'swale', 'rain_garden']

/** Ponds, swales and rain gardens: what drains into them. */
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
      {state.status === 'ready' && <Figures result={state.result} kind={p.kind} />}
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

function Figures({ result, kind }: { result: CatchmentResult; kind: string }) {
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
      {result.capacityM3 == null && <p className="text-loam-500">{t('relief.catchment.no_size')}</p>}
      {result.beyondRelief && <p className="text-loam-500">{t('relief.catchment.beyond')}</p>}
    </div>
  )
}
