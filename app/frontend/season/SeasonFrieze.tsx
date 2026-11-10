import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { addDays, daysBetween, formatDay, isoDay, toDate } from '@/team_board/board'
import type { BoardStep, StepKind } from '@/types/teamBoard'

const WEEK = 7
export const KIND_STYLE: Record<StepKind, string> = {
  design: 'bg-prune-500 text-white',
  site: 'bg-humus-500 text-white',
  plant: 'bg-leaf-600 text-white',
}
// A forecast step (an offer not signed yet): pencilled in, hatched paper
// inside a dashed outline of its kind's colour, so it never reads as booked.
const FORECAST_STYLE: Record<StepKind, string> = {
  design: 'border-2 border-dashed border-prune-500 text-prune-800 bg-[repeating-linear-gradient(135deg,var(--color-prune-200)_0_4px,var(--color-prune-50)_4px_9px)]',
  site: 'border-2 border-dashed border-humus-500 text-humus-800 bg-[repeating-linear-gradient(135deg,var(--color-humus-200)_0_4px,var(--color-humus-50)_4px_9px)]',
  plant: 'border-2 border-dashed border-leaf-600 text-leaf-800 bg-[repeating-linear-gradient(135deg,var(--color-leaf-200)_0_4px,var(--color-leaf-50)_4px_9px)]',
}
const stepStyle = (step: { kind: StepKind; forecast?: boolean }) => (step.forecast ? FORECAST_STYLE[step.kind] : KIND_STYLE[step.kind])
// Projects whose offer is not signed yet: their new steps start as forecasts.
const unsigned = (project?: SeasonProject) => project?.phase === 'request' || project?.phase === 'offer'
const monthName = new Intl.DateTimeFormat('fr-BE', { month: 'short' })

/** A project the frieze draws steps for: a map, with its stage when it has one. */
export type SeasonProject = { id: number; name: string; phase?: string | null; closedAt?: string | null }
export type StepBody = { map_id?: number; step_kind?: StepKind; title?: string; starts_on?: string; due_on?: string; forecast?: boolean }
/** Where the frieze saves: the team board's endpoints, or the map's. */
export type StepApi = {
  create: (body: StepBody) => Promise<BoardStep>
  update: (id: number, body: StepBody) => Promise<BoardStep>
  destroy: (id: number) => Promise<void>
}

type Drag = { id: number; mode: 'move' | 'start' | 'end'; x0: number; dayWidth: number; startsOn: string; dueOn: string; moved: boolean }
type Lane = { key: string; label: ReactNode; addLabel: string; projectId: number; kind?: StepKind; steps: BoardStep[] }

/**
 * The twelve months to come: design, work site and planting steps on a
 * calendar with the bare-root planting window. A step is dragged to move
 * it and stretched by either edge, a week at a time, and the arrow keys do
 * the same. Each step is a dated task of its map (SeasonSteps), so the
 * map's « Tâches » page (`single`: this project, one lane per kind of step)
 * and the team board (every project, one lane each) draw the same steps.
 * A step of a project still at the offer stage is a forecast
 * (« prévisionnel »): hatched and dashed until someone confirms it.
 */
export function SeasonFrieze({ steps: initial, projects, single = false, season, today, stepKinds, api, notify, canEdit = true, onChanged, frame }: {
  steps: BoardStep[]
  projects: SeasonProject[]
  single?: boolean
  season: { opensOn: string; closesOn: string }
  today: string
  stepKinds: StepKind[]
  api: StepApi
  notify: (message: string, tone?: 'info' | 'error') => void
  canEdit?: boolean
  onChanged?: () => void
  /** Lays the frieze out in its page, with the « Ajouter une étape » button. */
  frame: (parts: { add: ReactNode; body: ReactNode; hasSteps: boolean }) => ReactNode
}) {
  const [steps, setSteps] = useState(initial)
  useEffect(() => setSteps(initial), [initial])
  const [editing, setEditing] = useState<BoardStep | 'new' | null>(null)
  const [newFor, setNewFor] = useState<{ projectId: number | null; kind?: StepKind }>({ projectId: null })
  const drag = useRef<Drag | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)

  const from = isoDay(new Date(toDate(today).getFullYear(), toDate(today).getMonth(), 1, 12))
  const to = isoDay(new Date(toDate(from).getFullYear(), toDate(from).getMonth() + 12, 1, 12))
  const total = daysBetween(from, to)
  const pct = (iso: string) => `${(Math.min(total, Math.max(0, daysBetween(from, iso))) / total) * 100}%`
  const span = (a: string, b: string) => `${(Math.max(0, Math.min(total, daysBetween(from, b) + 1) - Math.max(0, daysBetween(from, a))) / total) * 100}%`

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const d = new Date(toDate(from).getFullYear(), toDate(from).getMonth() + i, 1, 12)
    return { iso: isoDay(d), label: monthName.format(d) }
  }), [from])

  // Bare-root planting windows (1 November to the end of February) that fall in the twelve months.
  const windows = useMemo(() => {
    const opens = toDate(season.opensOn)
    return [0, 1].map((n) => ({
      from: isoDay(new Date(opens.getFullYear() + n, opens.getMonth(), opens.getDate(), 12)),
      // The last day of the closing month, leap years included.
      to: isoDay(new Date(toDate(season.closesOn).getFullYear() + n, toDate(season.closesOn).getMonth() + 1, 0, 12)),
    })).filter((w) => w.to >= from && w.from < to)
  }, [season, from, to])

  // Only the steps that touch the twelve months.
  const shown = steps.filter((s) => s.dueOn >= from && s.startsOn < to)
  const live = projects.filter((p) => !p.closedAt)
  const byStart = (a: BoardStep, b: BoardStep) => a.startsOn.localeCompare(b.startsOn)
  const lanes: Lane[] = single
    ? live.slice(0, 1).flatMap((project) => stepKinds.map((kind) => ({
      key: kind,
      projectId: project.id,
      kind,
      label: <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-loam-800"><span className={clsx('h-3 w-3 shrink-0 rounded-full', KIND_STYLE[kind])} />{t(`team_board.steps.${kind}`)}</span>,
      addLabel: t('team_board.season.add_kind', { kind: t(`team_board.steps.${kind}`).toLowerCase() }),
      steps: shown.filter((s) => s.mapId === project.id && s.kind === kind).sort(byStart),
    })))
    : live
      .map((project) => ({
        key: String(project.id),
        projectId: project.id,
        label: <Link href={`/maps/${project.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-loam-800 hover:text-prune-700">{project.name}</Link>,
        addLabel: t('team_board.season.add_title', { name: project.name }),
        steps: shown.filter((s) => s.mapId === project.id).sort(byStart),
      }))
      .filter((lane) => lane.steps.length > 0)
      .sort((a, b) => a.steps[0].startsOn.localeCompare(b.steps[0].startsOn))
  const hasSteps = lanes.some((lane) => lane.steps.length > 0)

  async function save(step: BoardStep, before: BoardStep) {
    try {
      const saved = await api.update(step.id, { starts_on: step.startsOn, due_on: step.dueOn })
      setSteps((list) => list.map((s) => (s.id === saved.id ? saved : s)))
      onChanged?.()
    } catch (e) {
      setSteps((list) => list.map((s) => (s.id === before.id ? before : s)))
      notify((e as Error).message || t('team_board.frieze.error'), 'error')
    }
  }

  function shift(step: BoardStep, mode: Drag['mode'], weeks: number, base = step): BoardStep {
    const d = weeks * WEEK
    if (mode === 'move') return { ...step, startsOn: addDays(base.startsOn, d), dueOn: addDays(base.dueOn, d) }
    if (mode === 'start') {
      const startsOn = addDays(base.startsOn, d)
      return { ...step, startsOn: startsOn > addDays(base.dueOn, -(WEEK - 1)) ? addDays(base.dueOn, -(WEEK - 1)) : startsOn }
    }
    const dueOn = addDays(base.dueOn, d)
    return { ...step, dueOn: dueOn < addDays(base.startsOn, WEEK - 1) ? addDays(base.startsOn, WEEK - 1) : dueOn }
  }

  function down(e: PointerEvent<HTMLElement>, step: BoardStep, mode: Drag['mode']) {
    if (e.button !== 0 || !canEdit) return
    e.stopPropagation()
    const lane = (e.currentTarget.closest('[data-lane]') as HTMLElement).getBoundingClientRect()
    ;(e.currentTarget.closest('[data-step]') as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id: step.id, mode, x0: e.clientX, dayWidth: lane.width / total, startsOn: step.startsOn, dueOn: step.dueOn, moved: false }
    setDragId(step.id)
  }

  function move(e: PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d) return
    const weeks = Math.round((e.clientX - d.x0) / d.dayWidth / WEEK)
    if (weeks !== 0) d.moved = true
    setSteps((list) => list.map((s) => (s.id === d.id ? shift(s, d.mode, weeks, { ...s, startsOn: d.startsOn, dueOn: d.dueOn }) : s)))
  }

  function up(step: BoardStep) {
    const d = drag.current
    drag.current = null
    setDragId(null)
    if (!d) return
    if (!d.moved) { setEditing(step); return }
    const now = steps.find((s) => s.id === d.id)
    if (now && (now.startsOn !== d.startsOn || now.dueOn !== d.dueOn)) void save(now, { ...now, startsOn: d.startsOn, dueOn: d.dueOn })
  }

  function key(e: KeyboardEvent, step: BoardStep) {
    if (!canEdit) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(step); return }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = shift(step, e.shiftKey ? 'end' : 'move', e.key === 'ArrowRight' ? 1 : -1)
    setSteps((list) => list.map((s) => (s.id === step.id ? next : s)))
    void save(next, step)
  }

  const todayAt = pct(today)
  // Under five weeks, a bar is too short for its name; nine in the narrower lanes of a single project.
  const narrow = (step: BoardStep) => daysBetween(step.startsOn, step.dueOn) < (single ? 63 : 35)
  const label = (step: BoardStep) => (step.forecast ? t('team_board.season.forecast_label', { title: step.title }) : step.title)
  const anyForecast = shown.some((s) => s.forecast)
  const labelColumn = single ? 'grid-cols-[8.5rem_1fr]' : 'grid-cols-[11rem_1fr]'
  const empty = single ? t('team_board.season.single_empty') : t('team_board.season.empty')

  const add = canEdit && live.length > 0 && (
    <Button variant="secondary" size="sm" onClick={() => { setNewFor({ projectId: single ? live[0].id : null }); setEditing('new') }}>
      <Plus className="h-4 w-4" aria-hidden />{t('team_board.season.add')}
    </Button>
  )

  const body = (
    <>
      <div className="overflow-x-auto rounded-2xl border border-loam-200 bg-[#fffdf7] shadow-[0_1px_0_var(--color-loam-200)]">
        <div className={clsx('px-4 pt-3 pb-4', single ? 'min-w-[44rem]' : 'min-w-[52rem]')}>
          <div className={clsx('grid gap-x-3', labelColumn)}>
            <span />
            <div className="relative h-7 border-b border-loam-200">
              {months.map((m) => (
                <span key={m.iso} style={{ left: pct(m.iso) }} className="absolute top-0 h-full border-l border-loam-200 pl-1.5 text-sm text-loam-500 first-letter:uppercase">{m.label}</span>
              ))}
            </div>
          </div>
          <div className="relative">
            {/* The planting window, the months and today, behind every lane. */}
            <div aria-hidden="true" className={clsx('pointer-events-none absolute inset-y-0 right-0', single ? 'left-[calc(8.5rem+0.75rem)]' : 'left-[calc(11rem+0.75rem)]')}>
              {windows.map((w) => (
                <span key={w.from} style={{ left: pct(w.from), width: span(w.from, w.to) }} className="absolute inset-y-0 bg-leaf-100/60" />
              ))}
              {months.slice(1).map((m) => <span key={m.iso} style={{ left: pct(m.iso) }} className="absolute inset-y-0 border-l border-dashed border-loam-200" />)}
              <span style={{ left: todayAt }} className="absolute inset-y-0 border-l-2 border-clay-400" />
            </div>
            {lanes.length === 0 ? (
              <p className="relative py-8 text-center font-hand text-xl text-loam-500">{empty}</p>
            ) : (
              <ul className="relative">
                {lanes.map((lane) => (
                  <li key={lane.key} className={clsx('grid items-center gap-x-3 border-b border-dashed border-loam-200/70 py-1.5 last:border-b-0', labelColumn)}>
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="min-w-0 flex-1 truncate">{lane.label}</span>
                      {canEdit && (
                        <IconButton size="sm" label={lane.addLabel} onClick={() => { setNewFor({ projectId: lane.projectId, kind: lane.kind }); setEditing('new') }} className="h-6 w-6 text-loam-400 hover:text-prune-700">
                          <Plus />
                        </IconButton>
                      )}
                    </span>
                    <div data-lane className="relative h-8">
                      {lane.steps.map((step) => (
                        <Fragment key={step.id}>
                          <div
                            data-step
                            role={canEdit ? 'button' : undefined}
                            tabIndex={canEdit ? 0 : undefined}
                            aria-label={`${label(step)} : ${formatDay(step.startsOn)} – ${formatDay(step.dueOn)}`}
                            title={`${label(step)} · ${formatDay(step.startsOn)} – ${formatDay(step.dueOn)}`}
                            onPointerDown={(e) => down(e, step, 'move')}
                            onPointerMove={move}
                            onPointerUp={() => up(step)}
                            onPointerCancel={() => { drag.current = null; setDragId(null) }}
                            onKeyDown={(e) => key(e, step)}
                            style={{ left: pct(step.startsOn), width: span(step.startsOn, step.dueOn) }}
                            className={clsx(
                              'group absolute inset-y-0.5 flex items-center overflow-hidden rounded-full px-3 text-sm font-semibold whitespace-nowrap select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
                              canEdit && 'cursor-grab touch-none',
                              stepStyle(step),
                              !step.forecast && 'shadow-sm',
                              step.done && 'opacity-50',
                              dragId === step.id && 'cursor-grabbing ring-2 ring-loam-900/30',
                            )}
                          >
                            {canEdit && <span onPointerDown={(e) => down(e, step, 'start')} className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize hover:bg-white/30" />}
                            {!narrow(step) && <span className="truncate">{step.title}</span>}
                            {canEdit && <span onPointerDown={(e) => down(e, step, 'end')} className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize hover:bg-white/30" />}
                          </div>
                          {/* A short step writes its name beside it, in pencil. */}
                          {narrow(step) && (
                            <span aria-hidden="true" style={{ left: `calc(${pct(step.startsOn)} + ${span(step.startsOn, step.dueOn)} + 0.375rem)` }} className="pointer-events-none absolute inset-y-0 flex items-center text-sm font-medium whitespace-nowrap text-loam-700">
                              {step.title}
                            </span>
                          )}
                        </Fragment>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {single && !hasSteps && lanes.length > 0 && (
              <p className="relative mt-2 text-center font-hand text-xl text-loam-500">{empty}</p>
            )}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-loam-500">
            {!single && stepKinds.map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1.5"><span className={clsx('h-3 w-5 rounded-full', KIND_STYLE[kind])} />{t(`team_board.steps.${kind}`)}</span>
            ))}
            {anyForecast && (
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-full border border-dashed border-loam-500 bg-[repeating-linear-gradient(135deg,var(--color-loam-200)_0_3px,transparent_3px_6px)]" />{t('team_board.season.forecast_legend')}</span>
            )}
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-leaf-100" />{t('team_board.season.window')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 border-l-2 border-clay-400" />{t('team_board.season.today')}</span>
          </p>
        </div>
      </div>
      {canEdit && (
        <StepDialog
          step={editing}
          projects={live}
          defaultProject={newFor.projectId}
          defaultKind={newFor.kind}
          today={today}
          stepKinds={stepKinds}
          api={api}
          notify={notify}
          onClose={() => setEditing(null)}
          onSaved={(step) => { setSteps((list) => (list.some((s) => s.id === step.id) ? list.map((s) => (s.id === step.id ? step : s)) : [...list, step])); onChanged?.() }}
          onDeleted={(id) => { setSteps((list) => list.filter((s) => s.id !== id)); onChanged?.() }}
        />
      )}
    </>
  )

  return <>{frame({ add, body, hasSteps })}</>
}

/** Adds a step to a project, or changes one: kind, name, from and to. */
function StepDialog({ step, projects, defaultProject, defaultKind, today, stepKinds, api, notify, onClose, onSaved, onDeleted }: {
  step: BoardStep | 'new' | null
  projects: SeasonProject[]
  defaultProject: number | null
  defaultKind?: StepKind
  today: string
  stepKinds: StepKind[]
  api: StepApi
  notify: (message: string, tone?: 'info' | 'error') => void
  onClose: () => void
  onSaved: (step: BoardStep) => void
  onDeleted: (id: number) => void
}) {
  const creating = step === 'new'
  const [mapId, setMapId] = useState('')
  const [kind, setKind] = useState<StepKind>('design')
  const [title, setTitle] = useState('')
  const [startsOn, setStartsOn] = useState(today)
  const [dueOn, setDueOn] = useState(addDays(today, 6))
  const [forecast, setForecast] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!step) return
    setBusy(false)
    setError(null)
    if (step === 'new') {
      // The coming Monday, for a week.
      const monday = addDays(today, (8 - toDate(today).getDay()) % 7 || 7)
      const id = defaultProject ?? projects[0]?.id
      setMapId(String(id ?? ''))
      setForecast(unsigned(projects.find((p) => p.id === id)))
      setKind(defaultKind ?? 'design')
      setTitle('')
      setStartsOn(monday)
      setDueOn(addDays(monday, 6))
    } else {
      setMapId(String(step.mapId))
      setKind(step.kind)
      setTitle(step.title)
      setStartsOn(step.startsOn)
      setDueOn(step.dueOn)
      setForecast(Boolean(step.forecast))
    }
  }, [step, defaultProject, defaultKind]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>
  const project = projects.find((p) => String(p.id) === mapId)

  async function submit(confirm = false) {
    setBusy(true)
    setError(null)
    try {
      const body: StepBody = { map_id: Number(mapId), step_kind: kind, title: title.trim(), starts_on: startsOn, due_on: dueOn, forecast: confirm ? false : forecast }
      const saved = creating ? await api.create(body) : await api.update((step as BoardStep).id, body)
      onSaved(saved)
      notify(t(confirm ? 'team_board.season.confirmed' : 'team_board.frieze.saved'))
      onClose()
    } catch (e) {
      setError((e as Error).message || t('team_board.frieze.error'))
      setBusy(false)
    }
  }

  async function remove() {
    if (creating) return
    setBusy(true)
    try {
      await api.destroy((step as BoardStep).id)
      onDeleted((step as BoardStep).id)
      onClose()
    } catch (e) {
      setError((e as Error).message || t('team_board.frieze.error'))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissOnBackdrop={false}
      title={creating ? (project ? t('team_board.season.add_title', { name: project.name }) : t('team_board.season.add')) : t('team_board.season.edit_title', { title: (step as BoardStep).title })}
      footer={<>
        {!creating && <Button variant="danger-ghost" className="mr-auto" onClick={() => void remove()} disabled={busy}><Trash2 className="h-4 w-4" aria-hidden />{t('team_board.season.delete')}</Button>}
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        {!creating && (step as BoardStep).forecast && (
          <Button variant="leaf" onClick={() => void submit(true)} disabled={busy || dueOn < startsOn}><Check className="h-4 w-4" aria-hidden />{t('team_board.season.confirm')}</Button>
        )}
        <Button variant={!creating && (step as BoardStep).forecast ? 'secondary' : undefined} onClick={() => void submit()} disabled={busy || !mapId || dueOn < startsOn}>{creating ? t('team_board.season.add_submit') : t('team_board.project.save')}</Button>
      </>}
    >
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700">{error}</p>}
        {creating && defaultProject == null && (
          <Field label={t('team_board.season.project')}>
            <Select value={mapId} onChange={(e) => { setMapId(e.target.value); setForecast(unsigned(projects.find((p) => String(p.id) === e.target.value))) }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        <fieldset>
          <legend className="text-sm font-medium text-loam-700">{t('team_board.season.kind')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {stepKinds.map((k) => (
              <label key={k} className={clsx('cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset', kind === k ? `${KIND_STYLE[k]} ring-transparent` : 'text-loam-700 ring-loam-200 hover:ring-loam-400')}>
                <input type="radio" name="kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
                {t(`team_board.steps.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2', forecast ? 'border-dashed border-loam-400 bg-loam-50' : 'border-transparent ring-1 ring-inset ring-loam-200')}>
          <input type="checkbox" checked={forecast} onChange={(e) => setForecast(e.target.checked)} className="mt-1 h-4 w-4 accent-prune-600" />
          <span className="text-sm">
            <span className="block font-medium text-loam-800">{t('team_board.season.forecast')}</span>
            <span className="block text-loam-500">{t('team_board.season.forecast_hint')}</span>
          </span>
        </label>
        <Field label={t('team_board.season.name')} hint={t('team_board.season.name_hint')}>
          <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t(`team_board.steps.${kind}`)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('team_board.season.starts_on')}>
            <Input type="date" required value={startsOn} onChange={(e) => { setStartsOn(e.target.value); if (e.target.value > dueOn) setDueOn(addDays(e.target.value, 6)) }} />
          </Field>
          <Field label={t('team_board.season.due_on')}>
            <Input type="date" required value={dueOn} min={startsOn} onChange={(e) => setDueOn(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  )
}
