import clsx from 'clsx'
import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import CompareTab from '@/map/soil/CompareTab'
import GuideTab from '@/map/soil/GuideTab'
import PlantsTab from '@/map/soil/PlantsTab'
import PointsTab from '@/map/soil/PointsTab'
import { soilActions, useSoil, type SoilTab } from '@/map/soil/store'

const TABS: SoilTab[] = ['guide', 'points', 'compare', 'plants']

/**
 * The « Sol » panel: a free sampling guide, the sampling points with their
 * lab results, the comparison of the points (reading of the results is part
 * of the paid plans) and the plants that say what the soil is like.
 */
export default function SoilPanel() {
  const editor = useEditor()
  const state = useSoil()
  const tab: SoilTab = state.tab ?? 'guide'
  const setTab = soilActions.setTab
  const mapId = editor.map.id

  useEffect(() => { soilActions.load(mapId); soilActions.loadObservations(mapId) }, [mapId])
  // First visit: start on the points when there are some, else on the guide; then the choice is the user's.
  useEffect(() => { if (state.tab == null && state.loaded) setTab(state.samples.length > 0 ? 'points' : 'guide') }, [state.tab, state.loaded, state.samples.length, setTab])

  return (
    <div className="space-y-4">
      <p className="hidden text-sm text-loam-600 md:block">{t('soil.panel.intro')}</p>

      <div role="tablist" aria-label={t('soil.panel_label')} className="flex gap-1 rounded-lg bg-loam-100 p-1">
        {TABS.map((id) => (
          <button
            key={id} type="button" role="tab" id={`soil-tab-${id}`} aria-selected={tab === id} aria-controls={`soil-tabpanel-${id}`}
            onClick={() => setTab(id)}
            className={clsx(
              'flex-auto rounded-md px-2 py-1.5 text-center text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-prune-600',
              tab === id ? 'bg-white text-loam-900 shadow-sm' : 'text-loam-500 hover:text-loam-800',
            )}
          >
            {t(`soil.panel.tabs.${id}`)}
          </button>
        ))}
      </div>

      {state.error && !state.loaded ? (
        <div className="space-y-2 rounded-lg bg-clay-50 p-3 text-sm text-clay-700">
          <p>{t('soil.panel.load_failed')}</p>
          <Button size="sm" variant="secondary" onClick={() => { soilActions.load(mapId, true); soilActions.loadObservations(mapId) }}>{t('soil.panel.retry')}</Button>
        </div>
      ) : (
        <div role="tabpanel" id={`soil-tabpanel-${tab}`} aria-labelledby={`soil-tab-${tab}`} tabIndex={0} className="outline-none">
          {tab === 'guide' && <GuideTab onStart={() => setTab('points')} />}
          {tab === 'points' && <PointsTab />}
          {tab === 'compare' && <CompareTab />}
          {tab === 'plants' && <PlantsTab />}
        </div>
      )}

      {(tab === 'points' || tab === 'plants') && (
        <label className="flex items-center gap-2 text-xs text-loam-500">
          <input type="checkbox" checked={state.showOnMap} onChange={(e) => soilActions.setShowOnMap(e.target.checked)} className="rounded border-loam-300 text-prune-600 focus:ring-prune-500" />
          {t('soil.panel.show_on_map')}
        </label>
      )}
    </div>
  )
}
