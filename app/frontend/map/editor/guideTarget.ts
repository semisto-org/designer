import type { MapStage } from '@/types'
import type { JourneyData, Season } from '@/types/journey'

export const STAGES: MapStage[] = ['observe', 'map', 'design', 'plant']

/**
 * What the guide card proposes for the step in focus: the next open item,
 * moving to the next step, the end of the journey, or nothing left in a
 * step that is not the current one. `panel` is null when this person has no
 * such panel (the card then shows no button).
 */
export type GuideTarget =
  | { kind: 'item'; item: string; panel: string | null }
  | { kind: 'advance'; stage: MapStage }
  | { kind: 'complete' }
  | { kind: 'step_done' }

export function guideTarget(data: JourneyData, focus: MapStage, resolvePanel: (name: string) => string | null): GuideTarget {
  if (focus === data.stage) {
    const next = data.next
    if (next.type === 'item') return { kind: 'item', item: next.item, panel: resolvePanel(next.panel) }
    if (next.type === 'advance') return { kind: 'advance', stage: next.stage }
    return { kind: 'complete' }
  }
  const open = data.steps.find((s) => s.key === focus)?.items.find((i) => !i.done)
  return open ? { kind: 'item', item: open.key, panel: resolvePanel(open.panel) } : { kind: 'step_done' }
}

/** Share of the journey's checklist already done, 0 to 100. */
export function journeyPercent(data: JourneyData): number {
  const total = data.steps.reduce((sum, s) => sum + s.total, 0)
  const done = data.steps.reduce((sum, s) => sum + s.completed, 0)
  return total > 0 ? Math.round((done / total) * 100) : 0
}

export const SEASONS: Season[] = ['winter', 'spring', 'summer', 'autumn']

/**
 * The season to go out and observe now: today's, while it has never been
 * looked at over the last twelve months. It never replaces the next action:
 * a place is read over four seasons, and nobody waits a year to start.
 */
export function seasonToObserve(data: JourneyData): Season | null {
  const season = data.season
  return season && season.missing.includes(season.current) ? season.current : null
}
