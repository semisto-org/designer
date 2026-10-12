import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowRight, CalendarCheck, ExternalLink, Moon, MoreHorizontal, RotateCcw, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { BoardPhase, BoardProject } from '@/types/teamBoard'
import { BoardSection, Faces, addDays, daysBetween, formatDay, useBoard } from './board'
import { PhaseIcon, phaseTone } from './PhaseIcon'
import { ProjectDialog } from './ProjectDialog'

/** Beyond this, a project that has not left its column reads as stuck. */
const STUCK_DAYS = 30
/** A promise to the client this close (or past) is shown in red. */
const PROMISE_SOON_DAYS = 14
const DRAG_TYPE = 'application/x-board-project'

/**
 * Every team project on one timeline, from the request to completion. A
 * card is dragged from one column to the next; when it lands it asks for
 * its next step (a dated task with a person), so no project sits still
 * without anyone knowing what comes next. Its menu does the same for touch
 * screens and keyboards.
 */
export function Frieze({ projects, onTick }: { projects: BoardProject[]; onTick: (project: BoardProject) => void }) {
  const { phases } = useBoard()
  const [moving, setMoving] = useState<{ project: BoardProject; phase: BoardPhase } | null>(null)
  const [editing, setEditing] = useState<BoardProject | null>(null)
  const [over, setOver] = useState<BoardPhase | null>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  const open = projects.filter((p) => !p.closedAt)
  const closed = projects.filter((p) => p.closedAt)
  const byId = new Map(projects.map((p) => [p.id, p]))

  // Keep the dialogs on the latest version of their project.
  const editingNow = editing && (byId.get(editing.id) ?? null)

  function drop(event: DragEvent, phase: BoardPhase) {
    event.preventDefault()
    setOver(null)
    const id = Number(event.dataTransfer.getData(DRAG_TYPE))
    const project = byId.get(id)
    if (project && project.phase !== phase) setMoving({ project, phase })
  }

  return (
    <BoardSection id="board-frieze" title={t('team_board.frieze.title')} hint={open.length > 0 ? t('team_board.frieze.hint') : undefined}>
      {projects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-loam-300 bg-[#fffdf7] px-5 py-4 font-hand text-xl leading-snug text-loam-500">{t('team_board.frieze.empty')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {phases.map((phase) => {
            const column = open.filter((p) => p.phase === phase)
              .sort((a, b) => Number(!!a.onHoldSince) - Number(!!b.onHoldSince) || a.phaseChangedAt.localeCompare(b.phaseChangedAt))
            return (
              <div
                key={phase}
                onDragOver={(e) => { if (dragged != null) { e.preventDefault(); setOver(phase) } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }}
                onDrop={(e) => drop(e, phase)}
                className={clsx(
                  'flex min-w-0 flex-col gap-2 rounded-2xl p-2 transition-colors',
                  over === phase ? 'bg-prune-50 ring-2 ring-prune-300 ring-inset' : 'bg-loam-100/70',
                )}
              >
                <h3 className="flex items-center gap-1.5 px-1 pt-1 text-sm font-semibold text-loam-800">
                  <PhaseIcon phase={phase} className={clsx('h-6 w-6', column.length ? phaseTone(phase) : 'text-loam-300')} />
                  {t(`team_board.phases.${phase}`)}
                  <span className="ml-auto rounded-full bg-white px-2 text-sm font-semibold text-loam-600 tabular-nums">{column.length}</span>
                </h3>
                {column.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    dragging={dragged === project.id}
                    onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, String(project.id)); e.dataTransfer.effectAllowed = 'move'; setDragged(project.id) }}
                    onDragEnd={() => { setDragged(null); setOver(null) }}
                    onMove={(to) => setMoving({ project, phase: to })}
                    onSettings={() => setEditing(project)}
                    onTick={() => onTick(project)}
                  />
                ))}
                {column.length === 0 && (
                  <p className={clsx('rounded-xl border border-dashed px-3 py-4 text-center font-hand text-lg leading-tight', dragged != null ? 'border-prune-300 text-prune-500' : 'border-loam-300 text-loam-400')}>
                    {t('team_board.frieze.empty_column')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
      {closed.length > 0 && <ClosedProjects projects={closed} />}
      <MoveDialog move={moving} onClose={() => setMoving(null)} />
      <ProjectDialog project={editingNow} onClose={() => setEditing(null)} />
    </BoardSection>
  )
}

function ProjectCard({ project, dragging, onDragStart, onDragEnd, onMove, onSettings, onTick }: {
  project: BoardProject
  dragging: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onMove: (phase: BoardPhase) => void
  onSettings: () => void
  onTick: () => void
}) {
  const { today } = useBoard()
  const days = Math.max(0, daysBetween(project.phaseChangedAt.slice(0, 10), today))
  const settled = project.phase === 'co_management' || project.phase === 'completed'
  const stuck = !settled && !project.onHoldSince && days > STUCK_DAYS
  const promiseIn = project.promisedOn ? daysBetween(today, project.promisedOn) : null
  const step = project.nextStep
  const stepLate = step && step.dueOn < today

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={project.name}
      className={clsx(
        'group relative cursor-grab space-y-2 rounded-xl border border-loam-200 bg-[#fffdf7] p-2.5 shadow-[0_1px_0_var(--color-loam-200)] transition active:cursor-grabbing',
        'hover:border-loam-300 hover:shadow-md',
        dragging && 'rotate-1 opacity-50',
        project.onHoldSince && 'opacity-60 saturate-50',
      )}
    >
      <div className="flex items-start gap-1">
        <Link href={`/maps/${project.id}`} draggable={false} className="min-w-0 flex-1 font-serif text-lg leading-tight text-loam-900 hover:text-prune-700">
          {project.name}
        </Link>
        <CardMenu project={project} onMove={onMove} onSettings={onSettings} />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSettings} className="min-w-0 rounded-full focus-visible:outline-2 focus-visible:outline-prune-600" aria-label={t('team_board.frieze.settings')}>
          {project.lead || project.crew.length ? <Faces lead={project.lead} crew={project.crew} /> : <span className="text-sm text-loam-400">{t('team_board.project.no_lead')}</span>}
        </button>
        <span
          title={t('team_board.frieze.in_column_since', { count: days })}
          className={clsx('ml-auto shrink-0 text-sm tabular-nums', stuck ? 'rounded-full bg-humus-50 px-2 font-semibold text-humus-800' : 'text-loam-500')}
        >
          {project.phase === 'completed' ? null : t('team_board.frieze.days', { count: days })}
        </span>
      </div>
      {project.onHoldSince && (
        <p className="inline-flex items-center gap-1 text-sm font-semibold text-loam-600"><Moon className="h-4 w-4" aria-hidden />{t('team_board.frieze.on_hold')}</p>
      )}
      {project.promisedOn && (
        <p className={clsx('flex items-center gap-1.5 text-sm', promiseIn != null && promiseIn <= PROMISE_SOON_DAYS ? 'font-semibold text-clay-700' : 'text-loam-600')}>
          <CalendarCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {project.promisedWhat
              ? t('team_board.frieze.promised_what', { what: project.promisedWhat, date: formatDay(project.promisedOn) })
              : t('team_board.frieze.promised', { date: formatDay(project.promisedOn) })}
          </span>
        </p>
      )}
      {project.phase !== 'completed' && (step ? (
        <div className={clsx('flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm', stepLate ? 'bg-clay-50 text-clay-800' : 'bg-leaf-50/70 text-loam-800')}>
          <input
            type="checkbox"
            onChange={onTick}
            draggable={false}
            aria-label={t('team_board.frieze.next_step_done')}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-loam-400 accent-leaf-600"
          />
          <span className="min-w-0 flex-1">
            <span className="block leading-snug">{step.title}</span>
            <span className={clsx('block', stepLate ? 'font-semibold' : 'text-loam-500')}>
              {formatDay(step.dueOn)}{step.assignee && ` · ${step.assignee.name.split(' ')[0]}`}
            </span>
          </span>
        </div>
      ) : (
        <button type="button" onClick={() => onMove(project.phase)} className="w-full rounded-lg border border-dashed border-loam-300 px-2 py-1.5 text-left text-sm text-loam-500 hover:border-prune-400 hover:text-prune-700">
          {t('team_board.frieze.no_next_step')}
        </button>
      ))}
      {project.overdueTasks > (stepLate ? 1 : 0) && (
        <Link href={`/maps/${project.id}/tasks`} draggable={false} className="block text-sm font-semibold text-clay-700 hover:underline">
          {t('team_board.frieze.overdue_tasks', { count: project.overdueTasks })}
        </Link>
      )}
    </article>
  )
}

/** « … »: move to a column (touch, keyboard), the project's settings, its map. */
function CardMenu({ project, onMove, onSettings }: { project: BoardProject; onMove: (phase: BoardPhase) => void; onSettings: () => void }) {
  const { phases } = useBoard()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  const pick = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('team_board.frieze.menu', { name: project.name })}
        className="rounded-full p-1 text-loam-500 hover:bg-loam-100 hover:text-loam-800"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute top-8 right-0 z-30 w-60 rounded-xl border border-loam-200 bg-white p-1.5 text-sm shadow-xl">
          <p className="px-2.5 pt-1 pb-1.5 font-semibold text-loam-500">{t('team_board.frieze.move_to')}</p>
          {phases.filter((p) => p !== project.phase).map((phase) => (
            <button key={phase} role="menuitem" type="button" onClick={pick(() => onMove(phase))} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-loam-800 hover:bg-loam-100">
              <PhaseIcon phase={phase} className={clsx('h-5 w-5', phaseTone(phase))} />{t(`team_board.phases.${phase}`)}
            </button>
          ))}
          <div className="my-1.5 border-t border-loam-100" />
          <button role="menuitem" type="button" onClick={pick(onSettings)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-loam-800 hover:bg-loam-100">
            <Settings2 className="h-4 w-4 text-loam-500" />{t('team_board.frieze.settings')}
          </button>
          <Link role="menuitem" href={`/maps/${project.id}`} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-loam-800 hover:bg-loam-100">
            <ExternalLink className="h-4 w-4 text-loam-500" />{t('team_board.frieze.open_map')}
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * Where a project lands, and its next step: a task of the map with a
 * person and a date (who gets an e-mail). Also asks for the next step of a
 * project that has none (same phase).
 */
function MoveDialog({ move, onClose }: { move: { project: BoardProject; phase: BoardPhase } | null; onClose: () => void }) {
  const { members, today, saveProject } = useBoard()
  const you = members.find((m) => m.you)
  const [title, setTitle] = useState('')
  const [who, setWho] = useState<string>('')
  const [due, setDue] = useState(addDays(today, 7))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!move) return
    setTitle('')
    setWho(String(move.project.lead?.id ?? you?.id ?? ''))
    setDue(addDays(today, 7))
    setBusy(false)
  }, [move, you?.id, today])

  if (!move) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>
  const samePhase = move.project.phase === move.phase
  const toCompleted = move.phase === 'completed'
  const change = samePhase ? {} : { phase: move.phase }

  async function submit(withStep: boolean) {
    if (!move) return
    setBusy(true)
    const step = withStep && title.trim() ? { title: title.trim(), assignee_id: who ? Number(who) : null, due_on: due } : undefined
    const ok = await saveProject(move.project, change, step)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissOnBackdrop={false}
      title={<span className="flex items-center gap-2">
        {samePhase ? t('team_board.frieze.step_title', { name: move.project.name }) : <>
          <span className="truncate">{move.project.name}</span><ArrowRight className="h-4 w-4 shrink-0 text-loam-400" aria-hidden />
          <PhaseIcon phase={move.phase} className={clsx('h-6 w-6 shrink-0', phaseTone(move.phase))} />{t(`team_board.phases.${move.phase}`)}
        </>}
      </span>}
      footer={<>
        {!samePhase && <Button variant="ghost" onClick={() => void submit(false)} disabled={busy}>{toCompleted ? t('common.cancel') : t('team_board.frieze.move_without_step')}</Button>}
        <Button onClick={() => void submit(!toCompleted)} disabled={busy || (!toCompleted && !title.trim()) || (samePhase && !title.trim())}>
          {samePhase ? t('team_board.frieze.add_step') : t('team_board.frieze.move_submit')}
        </Button>
      </>}
    >
      {toCompleted ? (
        <p className="text-sm text-loam-600">{t('team_board.frieze.complete_hint')}</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) void submit(true) }} className="space-y-4">
          <p className="text-sm text-loam-600">{t('team_board.frieze.move_hint')}</p>
          <Field label={t('team_board.frieze.next_step')}>
            <Input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t(`team_board.frieze.next_step_examples.${move.phase}`)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('team_board.frieze.who')}>
              <Select value={who} onChange={(e) => setWho(e.target.value)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.you ? ` (${t('team_board.people.you')})` : ''}</option>)}
              </Select>
            </Field>
            <Field label={t('team_board.frieze.due_on')}>
              <Input type="date" required value={due} min={today} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((n) => (
              <button key={n} type="button" onClick={() => setDue(addDays(today, n))} className={clsx('rounded-full px-3 py-1 text-sm ring-1 ring-inset', due === addDays(today, n) ? 'bg-prune-50 font-semibold text-prune-800 ring-prune-400' : 'text-loam-600 ring-loam-200 hover:ring-loam-400')}>
                {t(`team_board.frieze.in_days.${n}`)}
              </button>
            ))}
          </div>
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  )
}

/** « Sans suite »: closed projects, folded, each with why and a way back. */
function ClosedProjects({ projects }: { projects: BoardProject[] }) {
  const { saveProject } = useBoard()
  return (
    <details className="group rounded-2xl border border-loam-200 bg-[#fffdf7] px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-loam-600 marker:text-loam-400">{t('team_board.frieze.closed', { count: projects.length })}</summary>
      <ul className="mt-3 divide-y divide-loam-100">
        {projects.map((project) => (
          <li key={project.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <Link href={`/maps/${project.id}`} className="font-semibold text-loam-800 hover:text-prune-700">{project.name}</Link>
            <span className="text-loam-500">
              {project.closedReason && t(`team_board.project.closed_reasons.${project.closedReason}`)}
              {project.closedNote && ` · ${project.closedNote}`}
            </span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void saveProject(project, { reopen: true })}>
              <RotateCcw className="h-4 w-4" aria-hidden />{t('team_board.project.reopen')}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Ticks a project's next step (the task) from the board. */
export function tickTask(mapId: number, taskId: number) {
  return api(`/maps/${mapId}/tasks/${taskId}`, { method: 'PATCH', body: { task: { completed: true } } })
}
