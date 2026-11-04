import { presentationStore, requestStep, setPresenting, shownSteps } from './store'
import type { PresentationView } from './types'

/**
 * Full-screen presenting, shared by the editor and the 3D relief: the
 * chrome steps aside (CSS on `html[data-presenting]`), the first ticked step
 * is asked for, and the viewer's own view (`before`) comes back at the end.
 * Each page shows the steps it can and hands the others to the other page.
 */
export function startPresenting(before: PresentationView) {
  const steps = shownSteps(presentationStore.get().presentation)
  if (steps.length === 0) return
  setPresenting(true, before)
  document.documentElement.dataset.presenting = 'true'
  document.documentElement.requestFullscreen?.().catch(() => {})
  requestStep(steps[0].id)
}

export function stopPresenting() {
  if (!presentationStore.get().presenting) return
  setPresenting(false)
  delete document.documentElement.dataset.presenting
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
}

/** The next (+1) or previous (-1) ticked step. */
export function goTo(by: number) {
  const { presentation, currentId } = presentationStore.get()
  const steps = shownSteps(presentation)
  if (steps.length === 0) return
  const index = steps.findIndex((s) => s.id === currentId)
  const next = steps[Math.min(steps.length - 1, Math.max(0, index < 0 ? 0 : index + by))]
  if (next.id === currentId && index >= 0) return
  requestStep(next.id)
}

export const currentStep = () => {
  const { presentation, currentId } = presentationStore.get()
  return presentation?.steps.find((s) => s.id === currentId) ?? null
}
