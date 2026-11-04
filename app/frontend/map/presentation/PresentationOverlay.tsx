import { Camera, ChevronLeft, ChevronRight, ListOrdered, NotebookPen, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { ChipButton } from '@/components/ui/ChipButton'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { isTextTarget } from '@/map/editor/history'
import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'
import { goTo, showStep, stopPresenting } from './presenting'
import { loadPresentation, saveSteps, setCurrentStep, shownSteps, usePresentation } from './store'
import { captureView } from './view'

/**
 * Always mounted in the editor. While presenting: the bar along the top
 * (previous, the step and its place, next, the note, leave) and the keys
 * (← →, space, Page up/down, Escape). While preparing, once a step was
 * shown from the panel: a card to capture the view on screen into it and
 * go back to the steps.
 */
export default function PresentationOverlay() {
  const editor = useEditor()
  const presenting = usePresentation((s) => s.presenting)
  const presentation = usePresentation((s) => s.presentation)
  const currentId = usePresentation((s) => s.currentId)
  const [noteOpen, setNoteOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  // `?panel=present` opens the panel; the steps load for it and for this overlay.
  useEffect(() => {
    if (editor.activePanel === 'present') void loadPresentation(editor.map.id)
  }, [editor.activePanel, editor.map.id])

  useEffect(() => {
    if (!presenting) return
    const onKey = (event: KeyboardEvent) => {
      if (isTextTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const forward = ['ArrowRight', 'PageDown', ' '].includes(event.key)
      const back = ['ArrowLeft', 'PageUp'].includes(event.key)
      if (forward || back) {
        // Before the editor's own arrows (moving a selected element, panning).
        event.preventDefault()
        event.stopPropagation()
        goTo(editor, forward ? 1 : -1)
      } else if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        event.preventDefault()
        stopPresenting(editor)
      }
    }
    // Leaving full screen (Escape in the browser) ends the presentation too.
    const onFullscreen = () => {
      if (!document.fullscreenElement) stopPresenting(editor)
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [presenting, editor])

  useEffect(() => {
    setNoteOpen(false)
    setListOpen(false)
  }, [currentId])

  const step = presentation?.steps.find((s) => s.id === currentId) ?? null

  if (presenting && presentation) {
    const steps = shownSteps(presentation)
    const index = steps.findIndex((s) => s.id === currentId)
    return createPortal(
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[85] flex flex-col items-center gap-2 px-4">
        <div role="toolbar" aria-label={t('presentations.bar.label')} className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_10px_30px_rgb(26_26_26/0.22)] ring-1 ring-loam-200">
          <IconButton label={t('presentations.bar.previous')} disabled={index <= 0} onClick={() => goTo(editor, -1)}>
            <ChevronLeft />
          </IconButton>
          <ChipButton tone="neutral" icon={<ListOrdered />} pressed={listOpen} onClick={() => setListOpen(!listOpen)} className="min-w-0 max-w-[50vw]">
            <span className="shrink-0 text-loam-500">{t('presentations.bar.position', { index: Math.max(1, index + 1), total: steps.length })}</span>
            <span className="truncate font-serif text-base text-loam-900">{step?.title}</span>
          </ChipButton>
          <IconButton label={t('presentations.bar.next')} disabled={index >= steps.length - 1} onClick={() => goTo(editor, 1)}>
            <ChevronRight />
          </IconButton>
          {step?.note && (
            <IconButton label={t(noteOpen ? 'presentations.bar.hide_note' : 'presentations.bar.note')} pressed={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>
              <NotebookPen />
            </IconButton>
          )}
          <Button variant="ghost" size="sm" title={t('presentations.bar.keys')} onClick={() => stopPresenting(editor)}>
            {t('presentations.bar.exit')}
          </Button>
        </div>
        {noteOpen && step?.note && (
          <div className="pointer-events-auto w-full max-w-xl whitespace-pre-line rounded-2xl bg-loam-50 px-4 py-3 text-sm text-loam-800 shadow-xl ring-1 ring-loam-200">
            {step.note}
          </div>
        )}
        {listOpen && (
          <ol className="pointer-events-auto max-h-[50vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-2 shadow-xl ring-1 ring-loam-200">
            {steps.map((s, i) => (
              <li key={s.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full !justify-start text-left"
                  aria-current={s.id === currentId ? 'step' : undefined}
                  onClick={() => showStep(editor, s.id)}
                >
                  <span className="w-6 shrink-0 text-loam-400">{i + 1}</span>
                  <span className={s.id === currentId ? 'font-semibold text-prune-800' : 'text-loam-800'}>{s.title}</span>
                </Button>
              </li>
            ))}
          </ol>
        )}
      </div>,
      document.body,
    )
  }

  // Preparing: a step was shown from the panel, which may have given way to the step's own panel.
  if (!step || editor.activePanel === 'present') return null
  const capture = () => {
    if (!presentation) return
    saveSteps(
      presentation.steps.map((s) => (s.id === step.id ? { ...s, view: captureView(editor), captured: true } : s)),
      (message) => editor.notify(message || t('presentations.save_failed'), 'error'),
    )
    editor.notify(t('presentations.captured', { title: step.title }))
  }
  return (
    <ZoneCard id="presentation-step" zone="top" priority={PRIORITY.notice} className="items-center">
      <div className="flex max-w-full items-center gap-1 rounded-full bg-white py-1 pl-4 pr-1 shadow-[0_6px_16px_rgb(26_26_26/0.14)] ring-1 ring-loam-200">
        <span className="min-w-0 truncate text-sm text-loam-800">{step.title}</span>
        {editor.canEdit && (
          <Button variant="ghost" size="sm" onClick={capture}>
            <Camera className="h-4 w-4" aria-hidden />
            {t('presentations.capture')}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => editor.openPanel('present')}>
          {t('presentations.back_to_steps')}
        </Button>
        <IconButton size="sm" label={t('presentations.done')} onClick={() => setCurrentStep(null)}>
          <X />
        </IconButton>
      </div>
    </ZoneCard>
  )
}
