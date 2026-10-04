import clsx from 'clsx'
import { ArrowRight, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { StepBadge, itemLabel, stageLabel } from '@/components/journey/JourneyParts'
import { JOURNEY_REFRESH, useChipHidden, useSeen } from '@/lib/journeyFlags'
import { LAYERS_PANEL_PATTERN, resolvePanel } from '@/lib/journeyPanels'
import { refreshJourney, useJourneyState } from '@/lib/journeyStore'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { useStageSetter } from '@/map/panels/JourneyPanel'

/**
 * Always mounted in the editor: keeps the journey fresh (recomputed when
 * the map changes), notes which browser-only items were seen, and shows a
 * small chip with the current step and the next best action.
 */
export default function JourneyOverlay() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { data } = useJourneyState()
  const [seen, setSeenFlag] = useSeen(mapId)
  const setStage = useStageSetter()
  const [hidden, setHidden] = useChipHidden(mapId)
  const [tick, setTick] = useState(0)

  // Opening the data layers panel counts as having looked at the layers.
  const activePanel = editor.activePanel
  useEffect(() => {
    if (activePanel && LAYERS_PANEL_PATTERN.test(activePanel)) setSeenFlag('layers_seen', true)
  }, [activePanel, setSeenFlag])

  useEffect(() => {
    const onRefresh = () => setTick((n) => n + 1)
    window.addEventListener(JOURNEY_REFRESH, onRefresh)
    return () => window.removeEventListener(JOURNEY_REFRESH, onRefresh)
  }, [])

  // What the checklists depend on, as a cheap signature of the map's state.
  const signature = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of editor.features) {
      const k = `${f.properties.layer}:${f.properties.status}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return [...counts.entries()].sort().join('|')
  }, [editor.features])

  const seenKey = seen.join(',')
  useEffect(() => {
    const timer = window.setTimeout(() => void refreshJourney(mapId, seenKey ? seenKey.split(',') : []), 350)
    return () => window.clearTimeout(timer)
  }, [mapId, editor.map.stage, Boolean(editor.map.boundary), signature, seenKey, tick])

  if (!editor.canEdit || !data || hidden || editor.activePanel === 'journey') return null

  const index = data.stageIndex
  const step = data.steps[index]
  const next = data.next
  const panelId = next.type === 'item' ? resolvePanel(next.panel, editor.canEdit) : null
  // On a phone the drafts bar takes the same spot under the drawing toolbar.
  const hasDrafts = editor.features.some((f) => f.properties.status === 'draft')

  return (
    <div
      className={clsx(
        // Under the drawing toolbar on a phone, bottom left (above the scale) from md up.
        'pointer-events-none absolute left-2 right-14 top-14 z-10 md:bottom-9 md:right-auto md:top-auto md:max-w-md',
        editor.activePanel ? 'md:left-[24.5rem]' : 'md:left-14',
        hasDrafts && 'hidden md:block',
      )}
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-white/95 py-1.5 pl-2 pr-1.5 shadow-lg ring-1 ring-loam-200 backdrop-blur">
        <button
          type="button" onClick={() => editor.openPanel('journey')} title={t('journey.panel.title')}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left"
        >
          <StepBadge index={index} step={step} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-loam-500">
              {t('journey.panel.step_of', { index: index + 1, total: data.steps.length })} · {stageLabel(step.key)}
            </span>
            <span className="block truncate text-sm font-medium text-loam-900">
              {next.type === 'item' && itemLabel(next.item)}
              {next.type === 'advance' && t('journey.panel.advance_cta', { stage: stageLabel(next.stage) })}
              {next.type === 'complete' && t('journey.panel.complete_title')}
            </span>
          </span>
        </button>
        {next.type === 'item' && panelId && (
          <button
            type="button" onClick={() => editor.openPanel(panelId)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-prune-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-prune-700"
          >
            {t('journey.panel.open')}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        {next.type === 'advance' && (
          <button
            type="button" onClick={() => setStage(next.stage)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-leaf-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-leaf-700"
          >
            {stageLabel(next.stage)}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        <button
          type="button" aria-label={t('journey.panel.chip_hide')} title={t('journey.panel.chip_hide')}
          onClick={() => setHidden(true)}
          className="shrink-0 rounded-md p-1 text-loam-400 hover:bg-loam-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
