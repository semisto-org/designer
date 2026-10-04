import clsx from 'clsx'
import { ArrowRight, Check, ChevronDown, Circle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  STEP_ICONS, StepBadge, itemHint, itemLabel, itemProgressText, stageLabel,
} from '@/components/journey/JourneyParts'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useJourneyState } from '@/lib/journeyStore'
import { useChipHidden, useSeen } from '@/lib/journeyFlags'
import { resolvePanel } from '@/lib/journeyPanels'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapData, MapStage } from '@/types'
import type { JourneyItem, JourneyNext } from '@/types/journey'

/** Change the stage the person says they are at (owner and editors). */
export function useStageSetter() {
  const editor = useEditor()
  return async (stage: MapStage) => {
    try {
      const { map } = await api<{ map: MapData }>(`/maps/${editor.map.id}`, { method: 'PATCH', body: { map: { stage } } })
      editor.setMap(map)
      editor.notify(t('journey.panel.stage_saved', { stage: stageLabel(stage) }))
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }
}

/** The four steps with their checklists, and the next best action. */
export default function JourneyPanel() {
  const editor = useEditor()
  const { data, failed } = useJourneyState()
  const [, setSeen] = useSeen(editor.map.id)
  const [chipHidden, setChipHidden] = useChipHidden(editor.map.id)
  const setStage = useStageSetter()
  const [expanded, setExpanded] = useState<string | null>(editor.map.stage)

  if (!data) {
    return <p className="text-sm text-loam-500">{failed ? t('journey.panel.unavailable') : t('journey.panel.loading')}</p>
  }

  const openPanel = (panel: string) => {
    const id = resolvePanel(panel, editor.canEdit, editor.isOwner)
    if (id) editor.openPanel(id)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('journey.panel.intro')}</p>
      <NextAction next={data.next} onOpen={openPanel} onAdvance={(stage) => setStage(stage)} canEdit={editor.canEdit} isOwner={editor.isOwner} />
      <ol className="space-y-2">
        {data.steps.map((step, index) => {
          const open = expanded === step.key
          const Icon = STEP_ICONS[step.key]
          return (
            <li key={step.key} className={clsx('rounded-xl ring-1', step.current ? 'ring-prune-300 bg-prune-50/40' : 'ring-loam-200')}>
              <h3>
                <button
                  type="button" aria-expanded={open} aria-controls={`journey-step-${step.key}`}
                  onClick={() => setExpanded(open ? null : step.key)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                >
                  <StepBadge index={index} step={step} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-loam-900">
                      <Icon className="h-4 w-4 text-loam-500" aria-hidden />
                      {stageLabel(step.key)}
                      {step.current && <span className="rounded-full bg-prune-600 px-2 py-0.5 text-[11px] font-medium text-white">{t('journey.panel.current')}</span>}
                    </span>
                    <span className="block text-xs text-loam-500">
                      {step.done ? t('journey.panel.step_done') : t('journey.panel.step_count', { done: step.completed, total: step.total })}
                    </span>
                  </span>
                  <ChevronDown className={clsx('h-4 w-4 shrink-0 text-loam-400 transition-transform', open && 'rotate-180')} aria-hidden />
                </button>
              </h3>
              {open && (
                <div id={`journey-step-${step.key}`} className="border-t border-loam-100 px-3 pb-3 pt-2">
                  <p className="mb-2 text-xs text-loam-500">{t(`journey.steps.${step.key}.summary`)}</p>
                  <ul className="space-y-1">
                    {step.items.map((item) => (
                      <ChecklistItem
                        key={item.key} item={item}
                        onOpen={() => openPanel(item.panel)}
                        onToggle={(on) => setSeen(item.key, on)}
                        openable={resolvePanel(item.panel, editor.canEdit, editor.isOwner) != null}
                      />
                    ))}
                  </ul>
                  {!step.current && (
                    <div className="mt-3">
                      {editor.canEdit
                        ? <Button size="sm" variant="secondary" onClick={() => setStage(step.key)}>{t('journey.panel.mark_stage')}</Button>
                        : <p className="text-xs text-loam-500">{t('journey.panel.read_only')}</p>}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {editor.canEdit && chipHidden && (
        <button type="button" onClick={() => setChipHidden(false)} className="text-sm font-medium text-prune-700 hover:underline">
          {t('journey.panel.chip_show')}
        </button>
      )}
    </div>
  )
}

function ChecklistItem({ item, openable, onOpen, onToggle }: {
  item: JourneyItem; openable: boolean; onOpen: () => void; onToggle: (on: boolean) => void
}) {
  const progress = itemProgressText(item)
  const mark = item.done
    ? <span className="grid h-5 w-5 place-items-center rounded-full bg-leaf-500 text-white"><Check className="h-3 w-3" aria-hidden /></span>
    : <Circle className="h-5 w-5 text-loam-300" aria-hidden />
  return (
    <li className="flex items-start gap-2.5 rounded-lg px-1 py-1.5">
      {item.client ? (
        // Only the browser knows: the person ticks it, or opening the panel does.
        <button
          type="button" onClick={() => onToggle(!item.done)}
          aria-pressed={item.done} aria-label={item.done ? t('journey.panel.untick') : t('journey.panel.tick')}
          title={item.done ? t('journey.panel.untick') : t('journey.panel.tick')}
          className="mt-0.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600"
        >
          {mark}
        </button>
      ) : <span className="mt-0.5" aria-hidden>{mark}</span>}
      <div className="min-w-0 flex-1">
        <p className={clsx('text-sm', item.done ? 'text-loam-500 line-through decoration-loam-300' : 'font-medium text-loam-800')}>
          {itemLabel(item.key)}
          <span className="sr-only">{item.done ? ` (${t('journey.panel.step_done')})` : ''}</span>
        </p>
        {!item.done && <p className="text-xs text-loam-500">{itemHint(item)}</p>}
        {progress && <p className="mt-0.5 text-xs font-medium text-prune-700">{progress}</p>}
      </div>
      {openable && (
        <button
          type="button" onClick={onOpen}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-prune-700 hover:bg-prune-50"
        >
          {t('journey.panel.open')}
        </button>
      )}
    </li>
  )
}

export function NextAction({ next, onOpen, onAdvance, canEdit, isOwner = false }: {
  next: JourneyNext; onOpen: (panel: string) => void; onAdvance: (stage: MapStage) => void; canEdit: boolean; isOwner?: boolean
}) {
  if (next.type === 'item') {
    const openable = resolvePanel(next.panel, canEdit, isOwner) != null
    return (
      <div className="rounded-xl bg-prune-600 p-3.5 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-prune-100">{t('journey.panel.next_label')}</p>
        <p className="mt-1 text-sm font-semibold">{itemLabel(next.item)}</p>
        {openable && (
          <button
            type="button" onClick={() => onOpen(next.panel)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-prune-700 hover:bg-prune-50"
          >
            {t('journey.panel.open')}<ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    )
  }
  if (next.type === 'advance') {
    return (
      <div className="rounded-xl bg-leaf-50 p-3.5 ring-1 ring-leaf-200">
        <p className="text-sm font-semibold text-leaf-800">{t('journey.panel.advance_title')}</p>
        <p className="mt-1 text-sm text-leaf-800">{t('journey.panel.advance_body', { stage: stageLabel(next.stage) })}</p>
        {canEdit && (
          <Button variant="leaf" size="sm" className="mt-2.5" onClick={() => onAdvance(next.stage)}>
            {t('journey.panel.advance_cta', { stage: stageLabel(next.stage) })}<ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="rounded-xl bg-leaf-50 p-3.5 ring-1 ring-leaf-200">
      <p className="text-sm font-semibold text-leaf-800">{t('journey.panel.complete_title')}</p>
      <p className="mt-1 text-sm text-leaf-800">{t('journey.panel.complete_body')}</p>
    </div>
  )
}
