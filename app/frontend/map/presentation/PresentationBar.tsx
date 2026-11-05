import { ChevronLeft, ChevronRight, ListOrdered, NotebookPen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { ChipButton } from '@/components/ui/ChipButton'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { isTextTarget } from '@/map/editor/history'
import { goTo, stopPresenting } from './presenting'
import { requestStep, shownSteps, usePresentation } from './store'

/**
 * The presenting bar along the top, on the map and in the 3D relief alike:
 * previous, the step and its place (a click lists the steps), next, the
 * note, leave. Keys: ← → space, Page up/down, Escape. Leaving full screen
 * ends the presentation too.
 */
export function PresentationBar() {
  const presenting = usePresentation((s) => s.presenting)
  const presentation = usePresentation((s) => s.presentation)
  const currentId = usePresentation((s) => s.currentId)
  const [noteOpen, setNoteOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  useEffect(() => {
    if (!presenting) return
    const onKey = (event: KeyboardEvent) => {
      if (isTextTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const forward = ['ArrowRight', 'PageDown', ' '].includes(event.key)
      const back = ['ArrowLeft', 'PageUp'].includes(event.key)
      if (forward || back) {
        // Before the page's own arrows (moving a selected element, walking).
        event.preventDefault()
        event.stopPropagation()
        goTo(forward ? 1 : -1)
      } else if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        event.preventDefault()
        stopPresenting()
      }
    }
    const onFullscreen = () => {
      if (!document.fullscreenElement) stopPresenting()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [presenting])

  useEffect(() => {
    setNoteOpen(false)
    setListOpen(false)
  }, [currentId])

  if (!presenting || !presentation) return null
  const steps = shownSteps(presentation)
  const index = steps.findIndex((s) => s.id === currentId)
  const step = presentation.steps.find((s) => s.id === currentId) ?? null

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[85] flex flex-col items-center gap-2 px-4">
      <div role="toolbar" aria-label={t('presentations.bar.label')} className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_10px_30px_rgb(26_26_26/0.22)] ring-1 ring-loam-200">
        <IconButton label={t('presentations.bar.previous')} disabled={index <= 0} onClick={() => goTo(-1)}>
          <ChevronLeft />
        </IconButton>
        <ChipButton tone="neutral" icon={<ListOrdered />} pressed={listOpen} onClick={() => setListOpen(!listOpen)} className="min-w-0 max-w-[50vw]">
          <span className="shrink-0 text-loam-500">{t('presentations.bar.position', { index: Math.max(1, index + 1), total: steps.length })}</span>
          <span className="truncate font-serif text-base text-loam-900">{step?.title}</span>
        </ChipButton>
        <IconButton label={t('presentations.bar.next')} disabled={index >= steps.length - 1} onClick={() => goTo(1)}>
          <ChevronRight />
        </IconButton>
        {step?.note && (
          <IconButton label={t(noteOpen ? 'presentations.bar.hide_note' : 'presentations.bar.note')} pressed={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>
            <NotebookPen />
          </IconButton>
        )}
        <Button variant="ghost" size="sm" title={t('presentations.bar.keys')} onClick={() => stopPresenting()}>
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
                onClick={() => requestStep(s.id)}
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
