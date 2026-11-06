import { router } from '@inertiajs/react'
import { Camera, X } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'
import { PresentationBar } from './PresentationBar'
import { SlideView } from './SlideView'
import { loadPresentation, markApplied, presentationStore, requestStep, restored, saveSteps, usePresentation } from './store'
import { applyView, captureView } from './view'

/**
 * Always mounted in the editor. Shows the step asked for (or hands it to
 * the 3D relief), the presenting bar while presenting and, while
 * preparing, once a step was shown from the panel, a card to capture the
 * view on screen into it and go back to the steps.
 */
export default function PresentationOverlay() {
  const editor = useEditor()
  const presenting = usePresentation((s) => s.presenting)
  const presentation = usePresentation((s) => s.presentation)
  const currentId = usePresentation((s) => s.currentId)
  const token = usePresentation((s) => s.token)
  const restore = usePresentation((s) => s.restore)

  // `?panel=present` opens the panel; the steps load for it and for this overlay.
  useEffect(() => {
    if (editor.activePanel === 'present') void loadPresentation(editor.map.id)
  }, [editor.activePanel, editor.map.id])

  // A step asked for (from the panel, the bar or the 3D relief): shown here,
  // or in the 3D relief when it has a relief view. The end of a presentation
  // gives the viewer's own view back, with the steps open.
  useEffect(() => {
    const state = presentationStore.get()
    if (state.mapId !== editor.map.id) return
    if (state.restore) {
      if (state.before) applyView(editor, { ...state.before, panel: state.before.panel ?? 'present' })
      restored()
      return
    }
    if (state.token === state.appliedToken) return
    const step = state.presentation?.steps.find((s) => s.id === state.currentId)
    if (!step) return markApplied()
    if (step.view.relief && !step.slide) {
      router.visit(`/maps/${editor.map.id}/relief`)
      return
    }
    // A slide shows its place behind it; while preparing, the steps stay open.
    applyView(editor, step.slide && !state.presenting ? { ...step.view, panel: editor.activePanel ?? undefined } : step.view)
    markApplied()
    // The editor object changes on every render; the request is what counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, restore, editor.map.id])

  const step = presentation?.steps.find((s) => s.id === currentId) ?? null

  const place = editor.map.name
  if (presenting) {
    return (
      <>
        {step?.slide && <SlideView step={step} place={place} />}
        <PresentationBar />
      </>
    )
  }

  // Preparing: a slide opens as it will be shown, until closed.
  if (step?.slide) return <SlideView step={step} place={place} onClose={() => requestStep(null)} />

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
        <IconButton size="sm" label={t('presentations.done')} onClick={() => requestStep(null)}>
          <X />
        </IconButton>
      </div>
    </ZoneCard>
  )
}
