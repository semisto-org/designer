import { Loader2, Mountain } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { chooseReliefOverlay, useReliefOverlay } from '@/relief/overlayStore'
import type { MapOverlayMode } from '@/relief/mapOverlay'
import type { ReliefOverview } from '@/types/relief'

const MODES = ['flow', 'shade'] as const

/**
 * « Ton relief », at the top of « Couches »: the flow axes and the
 * hillshade computed from this terrain's own relief (the same grid as the
 * 3D view), laid on the 2D map. Before the relief is imported, says where
 * to do it. Same choice as in « Eau et relief » (relief/overlayStore).
 */
export default function ReliefOverlaySection() {
  const editor = useEditor()
  const mapId = editor.map.id
  const [overview, setOverview] = useState<ReliefOverview | null>(null)
  const state = useReliefOverlay(mapId)
  const allowed = Boolean(editor.entitlements.analyses)

  useEffect(() => {
    if (!allowed) return
    const abort = new AbortController()
    api<ReliefOverview>(`/maps/${mapId}/terrain`, { signal: abort.signal })
      .then(setOverview)
      .catch(() => setOverview(null))
    return () => abort.abort()
  }, [mapId, allowed])

  if (!allowed || !overview?.available) return null
  const grid = overview.terrainGrid

  const choose = (mode: (typeof MODES)[number], checked: boolean) => {
    if (!grid) return
    const next: MapOverlayMode = checked ? mode : 'none'
    void chooseReliefOverlay(editor.instance, mapId, grid, next)
  }

  return (
    <section aria-labelledby="layers-relief-title">
      <h3 id="layers-relief-title" className="mb-2 text-sm font-semibold text-loam-700">
        {t('map_data.layers.relief.title')}
      </h3>
      {grid ? (
        <ul className="divide-y divide-loam-100 rounded-lg ring-1 ring-loam-200">
          {MODES.map((mode) => {
            const id = `relief-overlay-${mode}`
            const on = state.mode === mode
            return (
              <li key={mode} className="px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <input
                    id={id}
                    type="checkbox"
                    checked={on}
                    onChange={(e) => choose(mode, e.target.checked)}
                    aria-describedby={`${id}-description`}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="block cursor-pointer text-sm font-medium leading-tight text-loam-800">
                      {t(`map_data.layers.relief.${mode}`)}
                    </label>
                    <p id={`${id}-description`} className="mt-0.5 text-sm leading-snug text-loam-500">
                      {on && state.computing ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          {t('relief.panel_ui.overlay_loading')}
                        </span>
                      ) : (
                        <>
                          {t(`map_data.layers.relief.${mode}_description`)}
                          {on && mode === 'flow' && (
                            <span className="mt-1 block text-loam-600">
                              {t(state.dug ? 'map_data.layers.relief.flow_dug' : 'map_data.layers.relief.flow_as_is')}
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
          {state.failed && <li className="px-3 py-2 text-sm text-clay-700">{t('relief.panel_ui.overlay_failed')}</li>}
        </ul>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg bg-loam-50 px-3 py-2.5">
          <Mountain className="mt-0.5 h-4 w-4 shrink-0 text-loam-500" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm text-loam-600">{t('map_data.layers.relief.not_imported')}</p>
            <Button size="sm" variant="ghost" className="-ml-3" onClick={() => editor.openPanel('relief')}>
              {t('map_data.layers.relief.open_relief')}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
