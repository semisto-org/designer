import clsx from 'clsx'
import { CloudRain, Loader2, Repeat } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Input } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'
import { seasonOf, soilState, stormHistory, toLocalInput, waterOf, type StormCheck, type StormRelief } from './storm'

export const appliesToStorm = (feature: MapFeature) => feature.properties.kind === 'storm_observation' && feature.properties.status !== 'rejected'

const WATER = '#0e8fd6'
// Under this rate (mm/h), the soil itself is slow to drink.
const SLOW_SOIL_MM_H = 15
// A heavy downpour the station barely saw fell elsewhere than at the station.
const LOCAL_STORM_MM = 5
const dateFormat = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

type State = { status: 'loading' } | { status: 'ready'; check: StormCheck } | { status: 'error'; message: string }

/**
 * Inspector section of an observation made during a downpour: when it was
 * seen, what the relief makes of it, the rain the nearest station measured,
 * and the other downpours of the place, season after season.
 */
export default function StormSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const p = feature.properties
  const water = waterOf(p as Record<string, unknown>, feature.geometry?.type)
  const observedAt = typeof p.observed_at === 'string' ? p.observed_at : null
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!editor.entitlements.analyses) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    api<StormCheck>(`/maps/${editor.map.id}/relief/storm?feature_id=${p.id}`, { signal: controller.signal })
      .then((check) => setState({ status: 'ready', check }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof ApiError ? error.message : String(error) })
      })
    return () => controller.abort()
  }, [editor.map.id, editor.entitlements.analyses, p.id, p.lockVersion])

  function setTime(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return
    void saveFeature(editor, p.id, { properties: { ...storedProperties(feature), observed_at: date.toISOString() } })
  }

  function reverse() {
    if (feature.geometry?.type !== 'LineString') return
    void saveFeature(editor, p.id, { geometry: { type: 'LineString', coordinates: [...feature.geometry.coordinates].reverse() } })
  }

  const history = stormHistory(editor.features)
  return (
    <section className="space-y-3 border-t border-loam-100 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
          <CloudRain className="h-4 w-4" style={{ color: WATER }} />
          {t('relief.storm.title')} · {t(`relief.storm.water.${water}`)}
        </h3>
        <HelpButton compact slug="le-bilan-de-l-eau" />
      </div>
      <p className="text-sm text-loam-600">{t('relief.storm.intro')}</p>
      <label className="flex items-center gap-2 text-sm text-loam-700">
        <span className="shrink-0">{t('relief.storm.observed_at')}</span>
        <Input type="datetime-local" disabled={!editor.canEdit} value={observedAt ? toLocalInput(observedAt) : ''}
          onChange={(e) => setTime(e.target.value)} />
      </label>

      {editor.entitlements.analyses && state.status === 'loading' && (
        <p className="flex items-center gap-1.5 text-sm text-loam-500"><Loader2 className="h-4 w-4 animate-spin" />{t('relief.storm.loading')}</p>
      )}
      {state.status === 'error' && <p className="text-sm text-clay-700">{state.message}</p>}
      {state.status === 'ready' && (
        <>
          <Verdict relief={state.check.relief} canEdit={editor.canEdit} onReverse={reverse} onAxes={() => editor.openPanel('relief')} />
          <Rain check={state.check} heavy={p.rain === 'heavy' || p.rain === 'storm'} />
        </>
      )}

      <div className="space-y-1.5">
        <h4 className="font-serif text-lg text-loam-900">{t('relief.storm.history.title')}</h4>
        {history.length <= 1 ? (
          <p className="text-sm text-loam-600">{t('relief.storm.history.empty')}</p>
        ) : (
          <>
            <p className="text-sm text-loam-600">{t('relief.storm.history.intro')}</p>
            <ol className="space-y-1">
              {history.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => editor.select(item.id)} disabled={item.id === p.id}
                    className={clsx('block w-full rounded-lg px-2 py-1 text-left text-sm',
                      item.id === p.id ? 'bg-[#0e8fd6]/10 text-loam-900' : 'text-loam-700 hover:bg-loam-50')}>
                    <span className="font-medium tabular-nums">{dateFormat.format(item.at)}</span>
                    <span className="text-loam-500"> · {t(`relief.storm.seasons.${seasonOf(item.at)}`)}</span>
                    <span className="block text-loam-600">{t(`relief.storm.water.${item.water}`)}{item.rain ? ` · ${t(`drawing.options.rain.${item.rain}`)}` : ''}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  )
}

function Verdict({ relief, canEdit, onReverse, onAxes }: { relief: StormRelief; canEdit: boolean; onReverse: () => void; onAxes: () => void }) {
  if (!relief.available) {
    return (
      <p className="text-sm text-loam-600">
        {relief.message}
        {relief.reason === 'no_relief' && (
          <button type="button" onClick={onAxes} className="ml-1 text-prune-700 underline-offset-2 hover:underline">{t('relief.catchment.open_relief')}</button>
        )}
      </p>
    )
  }
  const text = (() => {
    switch (relief.verdict) {
      case 'uphill': return t('relief.storm.verdict.uphill', { rise: formatNumber(Math.abs(relief.fallM ?? 0)) })
      case 'hollow': return t('relief.storm.verdict.hollow', { depth: formatNumber(relief.hollowM ?? 0) })
      case 'flat': return t('relief.storm.verdict.flat', { slope: formatNumber(relief.slopePct ?? 0) })
      case 'sloped':
        return relief.infiltrationMmH != null
          ? t(`relief.storm.verdict.${relief.infiltrationMmH < SLOW_SOIL_MM_H ? 'sloped_slow' : 'sloped_fast'}`, { slope: formatNumber(relief.slopePct ?? 0), distance: formatNumber(relief.infiltrationDistanceM ?? 0), rate: formatNumber(relief.infiltrationMmH) })
          : t('relief.storm.verdict.sloped', { slope: formatNumber(relief.slopePct ?? 0) })
      case 'seep': return t('relief.storm.verdict.seep', { area: formatArea(relief.drainedM2 ?? 0) })
      default: return t(`relief.storm.verdict.${relief.verdict}`)
    }
  })()
  const tone = relief.verdict === 'diverges' || relief.verdict === 'sloped' ? 'bg-humus-50 text-loam-800' : 'bg-[#0e8fd6]/10 text-loam-800'
  return (
    <div className={clsx('space-y-1.5 rounded-2xl p-3 text-sm', tone)}>
      <p>{text}</p>
      {relief.shareOnAxes != null && relief.verdict !== 'uphill' && (
        <p className="text-loam-600">{t('relief.storm.share', { share: Math.round(relief.shareOnAxes * 100) })}</p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {relief.verdict === 'uphill' && canEdit && (
          <button type="button" onClick={onReverse} className="inline-flex items-center gap-1.5 text-prune-700 underline-offset-2 hover:underline">
            <Repeat className="h-4 w-4" />{t('relief.storm.reverse')}
          </button>
        )}
        {relief.water === 'flows' && (
          <button type="button" onClick={onAxes} className="text-prune-700 underline-offset-2 hover:underline">{t('relief.storm.see_axes')}</button>
        )}
      </div>
    </div>
  )
}

function Rain({ check, heavy }: { check: StormCheck; heavy: boolean }) {
  const rain = check.rain
  if (!rain.available) {
    return rain.reason === 'not_yet' ? <p className="text-sm text-loam-500">{t('relief.storm.rain.not_yet')}</p> : null
  }
  return (
    <p className="text-sm text-loam-700">
      {t('relief.storm.rain.measured', { station: rain.station.name, distance: formatNumber(rain.station.distanceKm), day: formatNumber(rain.dayMm) })}
      {rain.before3Mm != null && <> {t(`relief.storm.rain.before_${soilState(rain.before3Mm)}`, { before: formatNumber(rain.before3Mm) })}</>}
      {heavy && rain.dayMm < LOCAL_STORM_MM && <> {t('relief.storm.rain.local')}</>}
    </p>
  )
}
