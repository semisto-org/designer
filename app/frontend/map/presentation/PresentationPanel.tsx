import clsx from 'clsx'
import { ArrowDown, ArrowUp, Camera, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { captureView, applyView } from './view'
import {
  deletePresentation, loadPresentation, newStepId, saveSteps, setCurrentStep, shownSteps, startPresentation, usePresentation,
} from './store'
import { startPresenting } from './presenting'
import type { PresentationStep } from './types'

/**
 * « Présenter »: the steps of the map's presentation. A click on a step
 * shows its view; its camera button keeps the view on screen in its place.
 * Editors start from Semisto's template, tick what speaks to this client,
 * reorder, write their notes; everyone on the map can present.
 */
export default function PresentationPanel() {
  const editor = useEditor()
  const { map, canEdit } = editor
  const loaded = usePresentation((s) => s.loaded && s.mapId === map.id)
  const presentation = usePresentation((s) => s.presentation)
  const templates = usePresentation((s) => s.templates)
  const currentId = usePresentation((s) => s.currentId)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => void loadPresentation(map.id), [map.id])

  if (!loaded) return <p className="text-sm text-loam-500">…</p>

  const fail = (message: string) => editor.notify(message || t('presentations.save_failed'), 'error')
  const save = (steps: PresentationStep[]) => saveSteps(steps, (message, stale) => fail(stale ? t('presentations.stale') : message))

  if (!presentation) {
    if (!canEdit) return <p className="text-sm text-loam-600">{t('presentations.read_only')}</p>
    const start = async (template: string | null) => {
      setBusy(true)
      try {
        await startPresentation(map.id, template)
      } catch (error) {
        fail(error instanceof Error ? error.message : '')
      } finally {
        setBusy(false)
      }
    }
    return (
      <div className="space-y-3">
        <h3 className="font-serif text-lg text-loam-900">{t('presentations.empty_title')}</h3>
        <p className="text-sm text-loam-600">{t('presentations.empty_body')}</p>
        <HelpButton slug="presenter-son-design" label={t('presentations.help')} className="-ml-2" />
        {templates.map((template) => (
          <Button key={template.key} className="w-full" disabled={busy} onClick={() => start(template.key)}>
            {t('presentations.start_template', { name: template.name })}
          </Button>
        ))}
        <Button variant="ghost" className="w-full" disabled={busy} onClick={() => start(null)}>
          {t('presentations.start_blank')}
        </Button>
      </div>
    )
  }

  const steps = presentation.steps
  const shown = shownSteps(presentation)
  const update = (id: string, patch: Partial<PresentationStep>) => save(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (index: number, by: number) => {
    const next = [...steps]
    const [step] = next.splice(index, 1)
    next.splice(index + by, 0, step)
    save(next)
  }
  const show = (step: PresentationStep) => {
    setCurrentStep(step.id)
    applyView(editor, step.view)
  }
  const capture = (step: PresentationStep) => {
    update(step.id, { view: captureView(editor), captured: true })
    editor.notify(t('presentations.captured', { title: step.title }))
  }
  const addCurrent = () => {
    const step: PresentationStep = { id: newStepId(), title: t('presentations.new_step_title'), shown: true, captured: true, view: captureView(editor) }
    save([...steps, step])
    setEditing(step.id)
  }
  const remove = async (step: PresentationStep) => {
    if (!(await confirmAction({ title: t('presentations.delete_confirm', { title: step.title }), confirmLabel: t('presentations.delete'), tone: 'danger' }))) return
    save(steps.filter((s) => s.id !== step.id))
  }
  const removeAll = async () => {
    if (!(await confirmAction({ title: t('presentations.delete_presentation'), body: t('presentations.delete_presentation_confirm'), confirmLabel: t('presentations.delete_presentation'), tone: 'danger' }))) return
    deletePresentation().catch((error) => fail(error instanceof Error ? error.message : ''))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-loam-600">{t('presentations.intro')}</p>
      <HelpButton slug="presenter-son-design" label={t('presentations.help')} className="-ml-2" />
      <div className="flex items-center gap-3">
        <Button disabled={shown.length === 0} onClick={() => startPresenting(editor)}>
          <Play className="h-4 w-4" aria-hidden />
          {t('presentations.present')}
        </Button>
        <span className="text-sm text-loam-500">{t('presentations.shown_count', { count: shown.length, total: steps.length })}</span>
      </div>
      <ol className="space-y-1">
        {steps.map((step, index) => (
          <li key={step.id} className={clsx('rounded-lg', currentId === step.id && 'bg-prune-50')}>
            <div className="flex items-center gap-1">
              <input
                type="checkbox"
                className="ml-1.5 h-4 w-4 shrink-0 rounded border-loam-300 text-prune-600 focus:ring-prune-600"
                checked={step.shown}
                disabled={!canEdit}
                aria-label={t('presentations.toggle_shown')}
                onChange={(e) => update(step.id, { shown: e.target.checked })}
              />
              <Button
                variant="ghost"
                size="sm"
                title={t('presentations.show_step')}
                className={clsx('min-w-0 flex-1 !justify-start text-left font-medium', !step.shown && 'opacity-50')}
                onClick={() => show(step)}
              >
                <span className="w-5 shrink-0 text-loam-400">{index + 1}</span>
                <span className="truncate">{step.title}</span>
                <span
                  className={clsx('ml-auto h-2 w-2 shrink-0 rounded-full', step.captured ? 'bg-leaf-600' : 'bg-loam-300')}
                  title={t(step.captured ? 'presentations.captured_view' : 'presentations.default_view')}
                  aria-label={t(step.captured ? 'presentations.captured_view' : 'presentations.default_view')}
                />
              </Button>
              {canEdit && (
                <IconButton size="sm" label={t('presentations.capture')} onClick={() => capture(step)}>
                  <Camera />
                </IconButton>
              )}
              {canEdit && (
                <IconButton size="sm" label={t('presentations.edit')} pressed={editing === step.id} onClick={() => setEditing(editing === step.id ? null : step.id)}>
                  <Pencil />
                </IconButton>
              )}
            </div>
            {canEdit && editing === step.id && (
              <StepEditor
                step={step}
                first={index === 0}
                last={index === steps.length - 1}
                onChange={(patch) => update(step.id, patch)}
                onMove={(by) => move(index, by)}
                onRemove={() => remove(step)}
                onClose={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-loam-100 pt-3">
          <Button variant="secondary" size="sm" onClick={addCurrent}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('presentations.add_step')}
          </Button>
          <Button variant="danger-ghost" size="sm" onClick={removeAll}>
            {t('presentations.delete_presentation')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Title and note of a step, saved when the field is left; order and removal. */
function StepEditor({ step, first, last, onChange, onMove, onRemove, onClose }: {
  step: PresentationStep
  first: boolean
  last: boolean
  onChange: (patch: Partial<PresentationStep>) => void
  onMove: (by: number) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(step.title)
  const [note, setNote] = useState(step.note ?? '')
  useEffect(() => setTitle(step.title), [step.title])
  useEffect(() => setNote(step.note ?? ''), [step.note])

  return (
    <div className="space-y-2 px-2 pb-3 pt-1">
      <Field label={t('presentations.title_label')}>
        <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== step.title && onChange({ title: title.trim() })} />
      </Field>
      <Field label={t('presentations.note_label')}>
        <Textarea rows={3} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (step.note ?? '') && onChange({ note })} />
      </Field>
      <div className="flex items-center gap-1">
        <IconButton size="sm" label={t('presentations.move_up')} disabled={first} onClick={() => onMove(-1)}>
          <ArrowUp />
        </IconButton>
        <IconButton size="sm" label={t('presentations.move_down')} disabled={last} onClick={() => onMove(1)}>
          <ArrowDown />
        </IconButton>
        <IconButton size="sm" tone="danger" label={t('presentations.delete')} onClick={onRemove}>
          <Trash2 />
        </IconButton>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onClose}>{t('presentations.done')}</Button>
      </div>
    </div>
  )
}

