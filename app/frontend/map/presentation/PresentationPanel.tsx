import clsx from 'clsx'
import { ArrowDown, ArrowUp, Bot, Camera, Copy, GripVertical, Mountain, Pencil, Play, Plus, Trash2, Type } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { captureView } from './view'
import { cameraFlash } from './flash'
import { duplicateStep, MAX_STEPS } from './duplicate'
import {
  deletePresentation, loadPresentation, newStepId, requestStep, saveSteps, shownSteps, startPresentation, usePresentation,
} from './store'
import { startPresenting } from './presenting'
import type { PresentationStep, SlideProposal } from './types'

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

  // Each time the panel opens: drafts an AI proposed meanwhile come in.
  useEffect(() => void loadPresentation(map.id, { refresh: true }), [map.id])

  if (!loaded) return <p className="text-sm text-loam-500">…</p>

  const fail = (message: string) => editor.notify(message || t('presentations.save_failed'), 'error')
  const save = (steps: PresentationStep[]) => saveSteps(steps, (message, stale) => fail(stale ? t('presentations.stale') : message))

  if (!presentation) {
    if (!canEdit) return <p className="text-sm text-loam-600">{t('presentations.none_yet')}</p>
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
    cameraFlash()
    editor.notify(t('presentations.captured', { title: step.title }))
  }
  const addCurrent = () => {
    const step: PresentationStep = { id: newStepId(), title: t('presentations.new_step_title'), shown: true, captured: true, view: captureView(editor) }
    save([...steps, step])
    setEditing(step.id)
  }
  const addSlide = () => {
    const step: PresentationStep = { id: newStepId(), title: t('presentations.new_slide_title'), shown: true, captured: true, slide: { body: '' }, view: { ...captureView(editor), panel: undefined } }
    save([...steps, step])
    setEditing(step.id)
  }
  const duplicate = (step: PresentationStep) => {
    const result = duplicateStep(steps, step.id, newStepId(), t('presentations.copy_title', { title: step.title }))
    if (!result) return fail(t('presentations.errors.too_many', { count: MAX_STEPS }))
    save(result.steps)
    setEditing(result.copy.id)
    editor.notify(t('presentations.duplicated', { title: step.title }))
  }
  const accept = (step: PresentationStep, proposal: SlideProposal) => {
    update(step.id, { title: proposal.title || step.title, slide: { body: proposal.body }, shown: true, proposal: undefined })
    editor.notify(t('presentations.proposal.accepted', { title: proposal.title || step.title }))
  }
  const refuse = (step: PresentationStep) => {
    if (step.proposal?.new) save(steps.filter((s) => s.id !== step.id))
    else update(step.id, { proposal: undefined })
  }
  const pending = steps.filter((s) => s.proposal).length
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
      {canEdit && pending > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-humus-50 px-3 py-2 text-sm text-humus-900">
          <Bot className="h-4 w-4 shrink-0" aria-hidden />
          {t('presentations.proposal.pending', { count: pending })}
        </p>
      )}
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
              <Tooltip content={t('presentations.show_step')} align="start" className="min-w-0 flex-1">
              <Button
                variant="ghost"
                size="sm"
                className={clsx('w-full min-w-0 !justify-start text-left font-medium', !step.shown && 'opacity-50')}
                onClick={() => show(step)}
              >
                <span className="w-5 shrink-0 text-loam-400">{index + 1}</span>
                {step.slide && <Type className="h-4 w-4 shrink-0 text-prune-500" aria-label={t('presentations.slide')} />}
                <span className="truncate">{step.title}</span>
                {step.view.relief && <Mountain className="h-4 w-4 shrink-0 text-loam-400" aria-label={t('presentations.relief_view')} />}
              </Button>
              </Tooltip>
              {/* The step's state, explained on hover: slide text written, view adjusted to this place or still the template's. */}
              <Tooltip content={stepState(step)} align="end" className="shrink-0">
                <span tabIndex={0} aria-label={stepState(step)} className="inline-flex h-8 w-4 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-prune-600">
                  <span className={clsx('h-2 w-2 rounded-full', (step.slide ? step.slide.body : step.captured) ? 'bg-leaf-600' : 'bg-loam-300')} />
                </span>
              </Tooltip>
              {canEdit && (
                <Tooltip content={t('presentations.capture')} align="end">
                  <IconButton size="sm" label={t('presentations.capture')} title="" onClick={() => capture(step)}>
                    <Camera />
                  </IconButton>
                </Tooltip>
              )}
              {canEdit && (
                <Tooltip content={t('presentations.edit')} align="end">
                  <IconButton size="sm" label={t('presentations.edit')} title="" pressed={editing === step.id} onClick={() => setEditing(editing === step.id ? null : step.id)}>
                    <Pencil />
                  </IconButton>
                </Tooltip>
              )}
            </div>
            {canEdit && step.proposal && (
              <ProposalCard step={step} proposal={step.proposal} onAccept={() => step.proposal && accept(step, step.proposal)} onRefuse={() => refuse(step)} />
            )}
            {canEdit && editing === step.id && (
              <StepEditor
                step={step}
                onDropRelief={() => update(step.id, { view: { ...step.view, relief: undefined } })}
                first={index === 0}
                last={index === steps.length - 1}
                onChange={(patch) => update(step.id, patch)}
                onMove={(by) => move(index, by)}
                onDuplicate={steps.length < MAX_STEPS ? () => duplicate(step) : undefined}
                onRemove={() => remove(step)}
                onClose={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-loam-100 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={addCurrent}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('presentations.add_step')}
            </Button>
            <Button variant="secondary" size="sm" onClick={addSlide}>
              <Type className="h-4 w-4" aria-hidden />
              {t('presentations.add_slide')}
            </Button>
          </div>
          <Button variant="danger-ghost" size="sm" onClick={removeAll}>
            {t('presentations.delete_presentation')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** What the dot at the end of a step's row says. */
function stepState(step: PresentationStep) {
  if (step.slide) return t(step.slide.body ? 'presentations.slide' : 'presentations.slide_empty')
  return t(step.captured ? 'presentations.captured_view' : 'presentations.default_view')
}

/** Title and note of a step, saved when the field is left; order and removal. */
function StepEditor({ step, first, last, onChange, onMove, onDuplicate, onRemove, onClose, onDropRelief }: {
  step: PresentationStep
  /** Absent when the presentation is full. */
  onDuplicate?: () => void
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
  const [body, setBody] = useState(step.slide?.body ?? '')
  useEffect(() => setBody(step.slide?.body ?? ''), [step.slide?.body])
  useEffect(() => setTitle(step.title), [step.title])
  useEffect(() => setNote(step.note ?? ''), [step.note])

  return (
    <div className="space-y-2 px-2 pb-3 pt-1">
      <Field label={t('presentations.title_label')}>
        <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== step.title && onChange({ title: title.trim() })} />
      </Field>
      {step.slide && (
        <Field label={t('presentations.slide_body_label')}>
          <Textarea
            rows={6}
            value={body}
            maxLength={4000}
            placeholder={t('presentations.slide_body_placeholder')}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => body !== (step.slide?.body ?? '') && onChange({ slide: { body } })}
          />
        </Field>
      )}
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
        <IconButton size="sm" label={t('presentations.duplicate')} disabled={!onDuplicate} onClick={onDuplicate}>
          <Copy />
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


/** A slide an AI drafted: its text and reason, for an editor to accept or refuse. */
function ProposalCard({ step, proposal, onAccept, onRefuse }: { step: PresentationStep; proposal: SlideProposal; onAccept: () => void; onRefuse: () => void }) {
  return (
    <div className="mx-2 mb-2 space-y-2 rounded-xl border border-dashed border-humus-300 bg-humus-50/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-humus-900">
        <Bot className="h-4 w-4 shrink-0" aria-hidden />
        {t(proposal.new ? 'presentations.proposal.new_label' : 'presentations.proposal.label')}
        {proposal.by && <span className="font-normal text-humus-700">· {proposal.by}</span>}
      </p>
      {proposal.title && proposal.title !== step.title && <p className="font-serif text-base text-loam-900">{proposal.title}</p>}
      <p className="whitespace-pre-line text-sm text-loam-800">{proposal.body}</p>
      {proposal.rationale && <p className="text-sm text-loam-500">{proposal.rationale}</p>}
      {!proposal.new && step.slide?.body && <p className="text-sm text-loam-600">{t('presentations.proposal.replaces')}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={onAccept}>{t('presentations.proposal.accept')}</Button>
        <Button variant="ghost" size="sm" onClick={onRefuse}>{t('presentations.proposal.refuse')}</Button>
      </div>
    </div>
  )
}
