import clsx from 'clsx'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { itemLabel, stageLabel } from '@/components/journey/JourneyParts'
import { JOURNEY_REFRESH, useGuideCollapsed, useSeen } from '@/lib/journeyFlags'
import { isLayersPanel } from '@/lib/journeyPanels'
import { refreshJourney } from '@/lib/journeyStore'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import { STAGES, useGuide, type GuideTarget } from '@/map/editor/guide'
import { useStageSetter } from '@/map/panels/JourneyPanel'

/**
 * Always mounted in the editor: keeps the journey fresh (recomputed when
 * the map changes), notes which browser-only items were seen, and shows the
 * "À faire maintenant" card: the next thing to do in the step in focus.
 * The card folds to one line but never closes, so the guidance is never lost.
 */
export default function JourneyOverlay() {
  const editor = useEditor()
  const mapId = editor.map.id
  const [seen, setSeenFlag] = useSeen(mapId)
  const [tick, setTick] = useState(0)

  // Opening the data layers panel counts as having looked at the layers.
  const activePanel = editor.activePanel
  useEffect(() => {
    if (activePanel && isLayersPanel(activePanel)) setSeenFlag('layers_seen', true)
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

  if (!editor.canEdit || editor.activePanel === 'journey') return null
  return <GuideCard />
}

function GuideCard() {
  const editor = useEditor()
  const guide = useGuide()
  const setStage = useStageSetter()
  const desktop = useMediaQuery('(min-width: 768px)')
  const [stored, setCollapsed] = useGuideCollapsed(editor.map.id)
  const collapsed = stored ?? !desktop
  if (!guide.data || !guide.target) return null

  const target = guide.target
  const focus = guide.focus
  const action = actionFor(target, focus, editor.map.stage, editor.canEdit)
  const run = () => {
    if (target.kind === 'item' && target.panel) editor.openPanel(target.panel)
    else if (target.kind === 'advance') void setStage(target.stage)
    else if (target.kind === 'step_done' && focus !== editor.map.stage) void setStage(focus)
  }
  // On a phone the drafts bar takes the same spot under the drawing toolbar.
  const hasDrafts = editor.features.some((f) => f.properties.status === 'draft')

  return (
    <section
      aria-label={t('editor.guide.title')}
      className={clsx(
        // Under the drawing toolbar on a phone, bottom left from md up (beside an open panel).
        'absolute left-2 right-14 top-14 z-10 md:bottom-4 md:right-auto md:top-auto md:w-[300px]',
        editor.activePanel ? 'md:left-[21.5rem]' : 'md:left-4',
        hasDrafts && 'hidden md:block',
      )}
    >
      {collapsed ? (
        <div className="flex items-center gap-1 rounded-2xl bg-white py-1.5 pl-3 pr-1.5 shadow-[0_6px_16px_rgb(26_26_26/0.18)]">
          <button
            type="button" onClick={action ? run : () => setCollapsed(false)}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 text-left text-sm font-medium text-prune-700 hover:text-prune-900"
          >
            <span className="truncate">{t('editor.guide.collapsed', { action: action ?? t('editor.guide.step_title.' + focus) })}</span>
            {action && <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />}
          </button>
          <button
            type="button" onClick={() => setCollapsed(false)}
            aria-label={t('editor.guide.expand')} title={t('editor.guide.expand')} aria-expanded={false}
            className="shrink-0 rounded-lg p-1.5 text-loam-500 hover:bg-[#f4f1ea] hover:text-loam-900"
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_6px_16px_rgb(26_26_26/0.18)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg leading-none">{t('editor.guide.title')}</h2>
            <button
              type="button" onClick={() => setCollapsed(true)}
              aria-label={t('editor.guide.collapse')} title={t('editor.guide.collapse')} aria-expanded
              className="-mr-1.5 rounded-lg p-1.5 text-loam-500 hover:bg-[#f4f1ea] hover:text-loam-900"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={guide.percent}
            aria-label={t('editor.guide.progress', { percent: guide.percent })} title={t('editor.guide.progress', { percent: guide.percent })}
            className="h-1 overflow-hidden rounded-full bg-prune-100"
          >
            <div className="h-full rounded-full bg-prune-600 transition-[width] duration-200 ease-out" style={{ width: `${Math.max(guide.percent, 3)}%` }} />
          </div>
          <div className="flex flex-col gap-2 rounded-[10px] bg-prune-50 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-prune-600">
              <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-prune-600 text-[10px] text-white">{STAGES.indexOf(focus) + 1}</span>
              {t(`editor.guide.step_title.${focus}`)}
            </p>
            <p className="text-[12.5px] leading-[1.45] text-loam-600">{bodyFor(target, guide.data.steps.find((s) => s.key === focus)?.items.find((i) => target.kind === 'item' && i.key === target.item)?.target)}</p>
            {action && (
              <button
                type="button" onClick={run}
                className="inline-flex items-center gap-1.5 self-start rounded-full bg-prune-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-prune-800 active:scale-[0.98]"
              >
                {action}<ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
          <button type="button" onClick={() => editor.openPanel('journey')} className="self-start text-xs font-medium text-prune-700 hover:underline">
            {t('editor.guide.all_steps')}
          </button>
        </div>
      )}
    </section>
  )
}

/** The button of the card, or null when there is nothing to click. */
function actionFor(target: GuideTarget, focus: string, stage: string, canEdit: boolean): string | null {
  if (target.kind === 'item') return target.panel ? itemLabel(target.item) : null
  if (target.kind === 'advance') return canEdit ? t('journey.panel.advance_cta', { stage: stageLabel(target.stage) }) : null
  if (target.kind === 'step_done') return canEdit && focus !== stage ? t('editor.guide.mark_stage') : null
  return null
}

function bodyFor(target: GuideTarget, itemTarget: number | undefined): string {
  if (target.kind === 'item') return t(`journey.items.${target.item}.now`, { target: itemTarget ?? 0 })
  if (target.kind === 'advance') return t('journey.panel.advance_body', { stage: stageLabel(target.stage) })
  if (target.kind === 'step_done') return t('editor.guide.step_done')
  return t('journey.panel.complete_body')
}
