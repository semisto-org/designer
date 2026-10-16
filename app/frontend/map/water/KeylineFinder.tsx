import type { Feature } from 'geojson'
import { Eye, EyeOff, Loader2, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatArea, formatLength, formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { installKeylinePreview, type PreviewRole } from '@/map/layers/keyline'
import type { Keypoint, KeypointsResult } from '@/map/water/keyline'

type State = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; result: KeypointsResult } | { status: 'error'; message: string }

/**
 * « Keyline » in the « Eau et relief » panel: finds the keypoints of the
 * terrain's valleys, shows them on the map with their valley floor and
 * keyline, and places a keyline where the person chooses.
 */
export default function KeylineFinder() {
  const editor = useEditor()
  const map = editor.instance
  const [state, setState] = useState<State>({ status: 'idle' })
  const [shown, setShown] = useState(true)
  const [placing, setPlacing] = useState<number | null>(null)

  async function find() {
    setState({ status: 'loading' })
    setShown(true)
    try {
      setState({ status: 'ready', result: await api<KeypointsResult>(`/maps/${editor.map.id}/relief/keypoints`) })
    } catch (error) {
      setState({ status: 'error', message: (error as Error).message })
    }
  }

  function focus(point: Keypoint) {
    map.flyTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 18), duration: 600 })
  }

  async function place(point: Keypoint, index: number) {
    if (!point.keyline) return
    setPlacing(index)
    try {
      const created = await editor.createFeature({
        layer: 'water', kind: 'keyline', geometry: point.keyline.geometry,
        properties: { role: 'keyline', use: 'swale', width_m: 1, depth_m: 0.3 },
      })
      setShown(false)
      editor.notify(t('relief.keyline.placed', { elevation: formatNumber(point.keyline.elevationM), length: formatLength(point.keyline.lengthM) }))
      editor.select(created.properties.id)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    } finally {
      setPlacing(null)
    }
  }

  const keypoints = state.status === 'ready' && shown ? state.result.keypoints : null
  useEffect(() => {
    if (!keypoints?.length) return
    const features: Array<Feature & { properties: { role: PreviewRole } }> = []
    keypoints.forEach((point) => {
      features.push({ type: 'Feature', geometry: point.valley, properties: { role: 'valley' } })
      if (point.keyline) features.push({ type: 'Feature', geometry: point.keyline.geometry, properties: { role: 'keyline' } })
    })
    return installKeylinePreview(map, 'finder', features, keypoints.map((point, i) => ({
      lng: point.lng, lat: point.lat, label: String(i + 1), onClick: () => focus(point),
    })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, keypoints])

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
        <Waves className="h-4 w-4 text-[#2b7bb9]" />
        {t('relief.keyline.title')}
      </h3>
      <p className="text-sm text-loam-600">{t('relief.keyline.intro')}</p>
      {state.status !== 'ready' && (
        <Button variant="secondary" onClick={find} disabled={state.status === 'loading'} className="w-full">
          {state.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Waves className="h-4 w-4" />}
          {t(state.status === 'loading' ? 'relief.keyline.finding' : 'relief.keyline.find')}
        </Button>
      )}
      {state.status === 'error' && <p className="text-sm text-clay-700">{state.message}</p>}
      {state.status === 'ready' && state.result.keypoints.length === 0 && (
        <p className="rounded-lg bg-loam-50 p-3 text-sm text-loam-600">{t('relief.keyline.none')}</p>
      )}
      {state.status === 'ready' && state.result.keypoints.length > 0 && (
        <>
          <p className="text-sm font-medium text-loam-800">{t('relief.keyline.found', { count: state.result.keypoints.length })}</p>
          <ol className="space-y-2">
            {state.result.keypoints.map((point, i) => (
              <li key={`${point.lng},${point.lat}`} className="rounded-lg bg-loam-50 p-3 text-sm text-loam-700">
                <button type="button" onClick={() => focus(point)} className="flex w-full items-baseline gap-2 text-left">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2b7bb9] font-serif text-sm font-semibold text-white">{i + 1}</span>
                  <span className="font-semibold text-loam-900">{t('relief.keyline.point', { elevation: formatNumber(point.elevationM) })}</span>
                </button>
                <p className="mt-1">
                  {t('relief.keyline.slopes', { above: formatNumber(point.slopeAbovePct), below: formatNumber(point.slopeBelowPct) })}{' '}
                  {t('relief.keyline.catchment', { area: formatArea(point.catchmentM2) })}
                </p>
                {point.keyline ? (
                  editor.canEdit && (
                    <Button size="sm" onClick={() => place(point, i)} disabled={placing !== null} className="mt-2">
                      {placing === i && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t('relief.keyline.place', { length: formatLength(point.keyline.lengthM) })}
                    </Button>
                  )
                ) : (
                  <p className="mt-1 text-loam-500">{t('relief.keyline.no_keyline')}</p>
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button type="button" onClick={() => setShown((v) => !v)} className="inline-flex items-center gap-1.5 text-sm text-prune-700 underline-offset-2 hover:underline">
              {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {t(shown ? 'relief.keyline.hide' : 'relief.keyline.show')}
            </button>
            <button type="button" onClick={find} className="text-sm text-prune-700 underline-offset-2 hover:underline">{t('relief.keyline.again')}</button>
          </div>
        </>
      )}
      <p className="text-sm text-loam-500">{t('relief.keyline.method')}</p>
    </section>
  )
}
