import type { PresentationStep } from './types'

/** As many steps as the server keeps (MapPresentation::MAX_STEPS). */
export const MAX_STEPS = 60

/**
 * A copy of a step, placed just after it: same view, slide text and note,
 * a new id and the given title. The copy is the presenter's own step: it
 * leaves the template key and any AI draft behind, and is shown like its
 * original. Returns the new list and the copy, or null when the step is
 * unknown or the presentation is full.
 */
export function duplicateStep(steps: PresentationStep[], id: string, newId: string, title: string): { steps: PresentationStep[]; copy: PresentationStep } | null {
  const index = steps.findIndex((s) => s.id === id)
  if (index < 0 || steps.length >= MAX_STEPS) return null
  const { key: _key, proposal: _proposal, ...original } = steps[index]
  const copy: PresentationStep = structuredClone({ ...original, id: newId, title: title.slice(0, 120) })
  return { steps: [...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)], copy }
}
