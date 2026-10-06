import { resolvePanel } from '@/lib/journeyPanels'
import { useJourneyState } from '@/lib/journeyStore'
import { useEditor } from '@/map/editor/EditorContext'
import { guideTarget, journeyPercent, type GuideTarget } from '@/map/editor/guideTarget'
import type { MapStage } from '@/types'
import type { JourneyData, JourneyStep } from '@/types/journey'

export { STAGES, type GuideTarget } from '@/map/editor/guideTarget'

export type Guide = {
  data: JourneyData | null
  focus: MapStage
  step: JourneyStep | null
  target: GuideTarget | null
  percent: number
}

/** The guide for the step in focus (the map's current step unless another one was picked). */
export function useGuide(): Guide {
  const editor = useEditor()
  const { data } = useJourneyState()
  const usable = data && data.steps.length > 0 ? data : null
  const focus = editor.focusStage
  return {
    data: usable,
    focus,
    step: usable?.steps.find((s) => s.key === focus) ?? null,
    target: usable ? guideTarget(usable, focus, (name) => resolvePanel(name, editor.canEdit, editor.isOwner)) : null,
    percent: usable ? journeyPercent(usable) : 0,
  }
}
