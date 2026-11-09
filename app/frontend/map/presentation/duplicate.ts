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

/**
 * A text slide cut into one slide per title (slideMarkdown.splitByHeadings):
 * the slide keeps what comes before the first title (or takes the first
 * section when nothing does), each other section follows it as a new slide
 * on the same view of the place. Null when it would pass MAX_STEPS.
 */
export function splitSlideStep(
  steps: PresentationStep[], id: string, split: { lead: string; sections: { title: string; body: string }[] }, newId: () => string,
): PresentationStep[] | null {
  const index = steps.findIndex((s) => s.id === id)
  if (index < 0 || split.sections.length === 0) return null
  const { key: _key, proposal: _proposal, ...original } = steps[index]
  const sections = [...split.sections]
  const head: PresentationStep = split.lead
    ? { ...steps[index], slide: { body: split.lead } }
    : { ...steps[index], title: sections[0].title || steps[index].title, slide: { body: sections.shift()!.body } }
  const added = sections.map((section) => structuredClone({ ...original, id: newId(), title: section.title || original.title, shown: true, slide: { body: section.body } }))
  if (steps.length + added.length > MAX_STEPS) return null
  return [...steps.slice(0, index), head, ...added, ...steps.slice(index + 1)]
}
