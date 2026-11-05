import clsx from 'clsx'
import { ArrowDown, ArrowUp, Camera, GripVertical, Mountain, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { captureView } from './view'
import {
  deletePresentation, loadPresentation, newStepId, requestStep, saveSteps, shownSteps, startPresentation, usePresentation,
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
  // Drag and drop: the step held and the place it would land (before that index).
  const [dragged, setDragged] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

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
  const moveTo = (from: number, to: number) => {
    if (to === from || to === from + 1) return
    const next = [...steps]
    const [step] = next.splice(from, 1)
    next.splice(to > from ? to - 1 : to, 0, step)
    save(next)
  }
  const move = (index: number, by: number) => moveTo(index, by > 0 ? index + by + 1 : index + by)
  const drop = () => {
    if (dragged != null && over != null) moveTo(dragged, over)
    setDragged(null)
    setOver(null)
  }
  const show = (step: PresentationStep) => requestStep(step.id)
  const capture = (step: PresentationStep) => {
    // A capture on the map makes it a map view, without the 3D relief.
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
        <Button disabled={shown.length === 0} onClick={() => startPresenting(captureView(editor))}>
          <Play className="h-4 w-4" aria-hidden />
          {t('presentations.present')}
        </Button>
        <span className="text-sm text-loam-500">{t('presentations.shown_count', { count: shown.length, total: steps.length })}</span>
      </div>
      <ol className="space-y-1">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={clsx(
              'rounded-lg border-t-2 border-transparent',
              currentId === step.id && 'bg-prune-50',
              dragged === index && 'opacity-40',
              dragged != null && over === index && '!border-prune-500',
              dragged != null && over === steps.length && index === steps.length - 1 && 'border-b-2 !border-b-prune-500',
            )}
            draggable={canEdit && editing !== step.id}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', step.id)
              setDragged(index)
            }}
            onDragOver={(e) => {
              if (dragged == null) return
              e.preventDefault()
              const box = e.currentTarget.getBoundingClientRect()
              setOver(e.clientY > box.top + box.height / 2 ? index + 1 : index)
            }}
            onDrop={(e) => {
              e.preventDefault()
              drop()
            }}
            onDragEnd={() => {
              setDragged(null)
              setOver(null)
            }}
          >
            <div className="flex items-center gap-1">
              {canEdit && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-loam-300" aria-hidden />}
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
                {step.view.relief && <Mountain className="h-4 w-4 shrink-0 text-loam-400" aria-label={t('presentations.relief_view')} />}
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
                onDropRelief={() => update(step.id, { view: { ...step.view, relief: undefined } })}
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
function StepEditor({ step, first, last, onChange, onMove, onRemove, onClose, onDropRelief }: {
  step: PresentationStep
  onDropRelief: () => void
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
      {step.view.relief && (
        <div className="flex items-center gap-2 rounded-lg bg-loam-50 px-3 py-2 text-sm text-loam-700">
          <Mountain className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{t('presentations.relief_view_note')}</span>
          <Button variant="ghost" size="sm" onClick={onDropRelief}>{t('presentations.drop_relief')}</Button>
        </div>
      )}
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

