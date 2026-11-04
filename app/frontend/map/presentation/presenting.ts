import type { Editor } from '@/map/editor/EditorContext'
import { presentationStore, setCurrentStep, setPresenting, shownSteps } from './store'
import { applyView, captureView } from './view'

/**
 * Full-screen presenting: the editor's chrome steps aside (CSS on
 * `html[data-presenting]`), the first ticked step comes up, and the viewer's own view comes back at the end.
 */
export function startPresenting(editor: Editor) {
  const steps = shownSteps(presentationStore.get().presentation)
  if (steps.length === 0) return
  setPresenting(true, captureView(editor))
  document.documentElement.dataset.presenting = 'true'
  document.documentElement.requestFullscreen?.().catch(() => {})
  const first = steps[0]
  // The chrome leaves first: the map takes its new size, then the view eases in.
  window.requestAnimationFrame(() => {
    editor.instance.resize()
    setCurrentStep(first.id)
    applyView(editor, first.view)
  })
}

export function stopPresenting(editor: Editor) {
  const { presenting, before } = presentationStore.get()
  if (!presenting) return
  setPresenting(false)
  delete document.documentElement.dataset.presenting
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  window.requestAnimationFrame(() => {
    editor.instance.resize()
    if (before) applyView(editor, { ...before, panel: 'present' })
  })
}

/** The next (+1) or previous (-1) ticked step. */
export function goTo(editor: Editor, by: number) {
  const { presentation, currentId } = presentationStore.get()
  const steps = shownSteps(presentation)
  if (steps.length === 0) return
  const index = steps.findIndex((s) => s.id === currentId)
  const next = steps[Math.min(steps.length - 1, Math.max(0, index < 0 ? 0 : index + by))]
  if (next.id === currentId && index >= 0) return
  setCurrentStep(next.id)
  applyView(editor, next.view)
}

export function showStep(editor: Editor, id: string) {
  const step = presentationStore.get().presentation?.steps.find((s) => s.id === id)
  if (!step) return
  setCurrentStep(id)
  applyView(editor, step.view)
}
