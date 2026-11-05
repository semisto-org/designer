// What the editor map is about: the land as it is (« Existant ») or the
// project drawn on it (« Projet »). Pure functions (no React, no MapLibre),
// tested in test/frontend/time.
//
// - existing: only what is on the ground; what one draws is on the ground;
// - project: the project stands out, what is on the ground fades behind it;
//   what one draws is still a project (`planned: true`).
//
// The mode and the time strip (moment.ts) hold each other: the land on
// arrival is the land as it was, so « Arrivée » is always seen in
// « Existant »; the years to come are the project's, so « An 5, 15, 30 »
// are always seen in « Projet ». « Aujourd'hui » is seen in both: the land
// alone, or the land with the project over it.

import { isFuture, type Moment } from './moment.ts'

export type DesignMode = 'existing' | 'project'

export const DESIGN_MODES: readonly DesignMode[] = ['existing', 'project']

export function parseMode(value: unknown): DesignMode | null {
  return DESIGN_MODES.includes(value as DesignMode) ? (value as DesignMode) : null
}

/**
 * The mode each step of the journey works in: one observes and maps the
 * land as it is, then designs and plants the project.
 */
export function modeForStage(stage: string | null | undefined): DesignMode {
  return stage === 'design' || stage === 'plant' ? 'project' : 'existing'
}

/** The mode a moment of the time strip belongs to, or null when both show it (today). */
export function modeOfMoment(moment: Moment): DesignMode | null {
  if (moment === 'arrival') return 'existing'
  return isFuture(moment) ? 'project' : null
}

/** The moment to show once the mode changes: the same one if it belongs to that mode, else today. */
export function momentForMode(moment: Moment, mode: DesignMode): Moment {
  const own = modeOfMoment(moment)
  return own == null || own === mode ? moment : 'today'
}

/** The mode to show once the moment changes: the moment's own, or the same one for today. */
export function modeForMoment(mode: DesignMode, moment: Moment): DesignMode {
  return modeOfMoment(moment) ?? mode
}
