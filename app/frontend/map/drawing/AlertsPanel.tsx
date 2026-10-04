import { bbox as turfBbox } from '@turf/turf'
import clsx from 'clsx'
import { ExternalLink, Info, LocateFixed, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { AlertsResponse, RegulatoryAlert } from '@/types/drawing'

/**
 * "Alertes": the region's fixed, sourced regulatory rules checked on the
 * drawing (server side, PostGIS). Re-checked when features change.
 */
export default function AlertsPanel() {
  const editor = useEditor()
  const [data, setData] = useState<AlertsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  // Re-check when geometry, kind or status of any feature changes.
  const signature = useMemo(
    () => editor.features.map((f) => `${f.properties.id}:${f.properties.lockVersion}`).join(','),
    [editor.features],
  )
  const boundaryKey = JSON.stringify(editor.map.boundary?.coordinates?.[0]?.[0]?.slice(0, 3) ?? null) + editor.map.lockVersion

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      api<AlertsResponse>(`/maps/${editor.map.id}/alerts`, { signal: controller.signal })
        .then((response) => {
          setData(response)
          setFailed(false)
        })
        .catch((error: Error) => {
          if (error.name !== 'AbortError') setFailed(true)
        })
    }, data ? 600 : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // `data` only decides the debounce of later checks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.map.id, signature, boundaryKey])

  function focus(alert: RegulatoryAlert) {
    const targets = editor.features.filter((f) => alert.featureIds.includes(f.properties.id))
    if (targets.length === 0) return
    const [minX, minY, maxX, maxY] = turfBbox({ type: 'FeatureCollection', features: targets })
    // Keep clear of this panel (left, or bottom on phones) and of the inspector (right).
    const { clientWidth: w, clientHeight: h } = editor.instance.getContainer()
    const padding = w >= 768
      ? { top: 70, bottom: 50, left: Math.round(Math.min(400, w * 0.3)), right: Math.round(Math.min(360, w * 0.28)) }
      : { top: 70, bottom: Math.round(h * 0.6), left: 30, right: 30 }
    editor.instance.fitBounds([minX, minY, maxX, maxY], { padding, maxZoom: 19, duration: 600 })
    editor.select(targets[0].properties.id)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-loam-600">{t('drawing.alerts.intro')}</p>
      <p className="flex items-start gap-2 rounded-lg bg-humus-50 px-3 py-2 text-xs font-medium text-humus-700">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('drawing.alerts.disclaimer')}
      </p>
      {failed && <p className="text-sm text-clay-500">{t('drawing.alerts.error')}</p>}
      {!data && !failed && <p className="text-sm text-loam-400">{t('common.loading')}</p>}
      {data && data.rulesCount === 0 && <p className="text-sm text-loam-500">{t('drawing.alerts.no_rules')}</p>}
      {data && data.rulesCount > 0 && !data.boundary && <p className="text-sm text-loam-500">{t('drawing.alerts.no_boundary')}</p>}
      {data && data.rulesCount > 0 && data.alerts.length === 0 && <p className="text-sm text-loam-500">{t('drawing.alerts.empty')}</p>}
      <ul className="space-y-2.5">
        {data?.alerts.map((alert) => (
          <li key={`${alert.rule}-${alert.featureIds.join('-')}`} className="rounded-lg p-3 ring-1 ring-loam-200">
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
                alert.severity === 'warning' ? 'bg-clay-50 text-clay-700' : 'bg-lichen-100 text-lichen-700',
              )}
            >
              {alert.severity === 'warning' ? <TriangleAlert className="h-3 w-3" aria-hidden /> : <Info className="h-3 w-3" aria-hidden />}
              {t(`drawing.alerts.severity.${alert.severity}`)}
            </span>
            <p className="mt-1.5 text-sm font-semibold text-loam-900">{alert.title}</p>
            <p className="mt-0.5 text-sm text-loam-600">{alert.explanation}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button type="button" onClick={() => focus(alert)} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
                <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                {t('drawing.alerts.show')}
              </button>
              {alert.source?.url && (
                <a href={alert.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-loam-500 hover:text-loam-700 hover:underline">
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  {t('drawing.alerts.source', { label: alert.source.label ?? alert.source.url })}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
