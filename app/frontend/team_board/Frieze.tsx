import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowDown, ArrowRight, ArrowUp, CalendarCheck, ChevronDown, ChevronsLeft, ChevronsRight, ChevronUp, CornerDownRight, ExternalLink, Moon, MoreHorizontal, Pencil, Plus, RotateCcw, Settings2, Sun, Trash2, Trees } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { MenuItem } from '@/components/ui/MenuItem'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { BoardPhase, BoardProject, BoardSection as Section } from '@/types/teamBoard'
import { BoardSection, Faces, addDays, columnSections, daysBetween, formatDay, sectionsBase, useBoard, type ProjectChange } from './board'
import { PhaseIcon, phaseTone } from './PhaseIcon'
import { ProjectDialog } from './ProjectDialog'
import { ProjectPreview } from './ProjectPreview'

/** Beyond this, a project that has not left its column reads as stuck. */
const STUCK_DAYS = 30
/** A promise to the client this close (or past) is shown in red. */
const PROMISE_SOON_DAYS = 14
const DRAG_TYPE = 'application/x-board-project'
/** « Terminé » shows the projects completed within these days; older ones fold. */
const RECENT_DAYS = 90
/** Remembers, per browser, whether « Terminé » was unfolded. */
const COMPLETED_OPEN_KEY = 'team-board:completed-open'
/** Where a card lands inside a column: one of its sections (null: none), or « En veille » at the bottom. */
type Slot = { section: number | null } | 'hold'
type Move = { project: BoardProject; phase: BoardPhase; change?: ProjectChange }
const slotKey = (phase: BoardPhase, slot: Slot) => `${phase}:${slot === 'hold' ? 'hold' : (slot.section ?? 'loose')}`

function readCompletedOpen() {
  try { return window.localStorage.getItem(COMPLETED_OPEN_KEY) === '1' } catch { return false }
}

/**
 * Every team project on one timeline, from the request to completion. A
 * card is dragged from one column to the next; when it lands it asks for
 * its next step (a dated task with a person), so no project sits still
 * without anyone knowing what comes next. Its menu does the same for touch
 * screens and keyboards.
 */
export function Frieze({ projects }: { projects: BoardProject[] }) {
  const { phases, sections, saveProject } = useBoard()
  const [moving, setMoving] = useState<Move | null>(null)
  const [editing, setEditing] = useState<BoardProject | null>(null)
  const [previewing, setPreviewing] = useState<number | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [naming, setNaming] = useState<{ phase: BoardPhase; section?: Section } | null>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  const [showOld, setShowOld] = useState(false)
  // « Terminé » is folded into a narrow strip by default: the work in
  // progress gets the room, and the finished projects stay one click away.
  const [completedOpen, setCompletedOpen] = useState(readCompletedOpen)
  function toggleCompleted(next: boolean) {
    setCompletedOpen(next)
    try { window.localStorage.setItem(COMPLETED_OPEN_KEY, next ? '1' : '0') } catch { /* private window: not remembered */ }
  }
  const { today } = useBoard()
  const open = projects.filter((p) => !p.closedAt)
  const closed = projects.filter((p) => p.closedAt)
  const byId = new Map(projects.map((p) => [p.id, p]))

  // Keep the dialogs on the latest version of their project.
  const editingNow = editing && (byId.get(editing.id) ?? null)
  const previewNow = previewing != null ? (byId.get(previewing) ?? null) : null

  // A card dropped in another column asks for its next step; inside its own
  // column, it only changes section, or goes to sleep, or wakes, at once.
  function drop(event: DragEvent, phase: BoardPhase, slot: Slot) {
    event.preventDefault()
    event.stopPropagation()
    setOver(null)
    const project = byId.get(Number(event.dataTransfer.getData(DRAG_TYPE)))
    if (!project) return
    const samePhase = project.phase === phase
    const change: ProjectChange = {}
    if (slot === 'hold') {
      if (!samePhase || !project.onHoldSince) change.on_hold = true
    } else {
      if (slot.section !== (samePhase ? project.sectionId : null)) change.section_id = slot.section
      if (samePhase && project.onHoldSince) change.on_hold = false
    }
    if (!samePhase) setMoving({ project, phase, change })
    else if (Object.keys(change).length > 0) void saveProject(project, change)
  }

  // A slot of a column (a section, « En veille »): a drop target of its own inside the column.
  const slotTarget = (phase: BoardPhase, slot: Slot) => ({
    onDragOver: (e: DragEvent) => { if (dragged != null) { e.preventDefault(); e.stopPropagation(); setOver(slotKey(phase, slot)) } },
    onDrop: (e: DragEvent) => drop(e, phase, slot),
  })

  return (
    <BoardSection id="board-frieze" title={t('team_board.frieze.title')} >
      {projects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-loam-300 bg-[#fffdf7] px-5 py-4 font-hand text-xl leading-snug text-loam-500">{t('team_board.frieze.empty')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:flex">
          {phases.map((phase) => {
            const all = open.filter((p) => p.phase === phase)
              .sort((a, b) => phase === 'completed'
                ? b.phaseChangedAt.localeCompare(a.phaseChangedAt)
                : Number(!!a.onHoldSince) - Number(!!b.onHoldSince) || a.phaseChangedAt.localeCompare(b.phaseChangedAt))
            // Finished long ago: folded at the bottom of « Terminé », so the column stays short.
            const old = phase === 'completed' ? all.filter((p) => daysBetween(p.phaseChangedAt.slice(0, 10), today) > RECENT_DAYS) : []
            const column = showOld ? all : all.filter((p) => !old.includes(p))
            const dropTarget = {
              onDragOver: (e: DragEvent) => { if (dragged != null) { e.preventDefault(); setOver(phase) } },
              onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) },
              onDrop: (e: DragEvent) => drop(e, phase, { section: null }),
            }
            const overColumn = over === phase || !!over?.startsWith(`${phase}:`)
            // The team's sections first, in their order, then « En veille », always last.
            const ownSections = columnSections(sections, phase)
            const known = new Set(ownSections.map((s) => s.id))
            const awake = column.filter((p) => !p.onHoldSince)
            const asleep = column.filter((p) => p.onHoldSince)
            const loose = awake.filter((p) => p.sectionId == null || !known.has(p.sectionId))
            const showHold = asleep.length > 0 || (dragged != null && phase !== 'completed')
            const card = (project: BoardProject) => (
              <ProjectCard
                key={project.id}
                project={project}
                dragging={dragged === project.id}
                onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, String(project.id)); e.dataTransfer.effectAllowed = 'move'; setDragged(project.id) }}
                onDragEnd={() => { setDragged(null); setOver(null) }}
                onMove={(to) => setMoving({ project, phase: to })}
                onSettings={() => setEditing(project)}
                onPreview={() => setPreviewing(project.id)}
              />
            )
            if (phase === 'completed' && !completedOpen) {
              // Folded: a narrow strip on the side (a bar on smaller screens),
              // still a place to drop a finished project.
              return (
                <div
                  key={phase}
                  {...dropTarget}
                  className={clsx(
                    'flex rounded-2xl transition-colors xl:w-14 xl:flex-none',
                    over === phase ? 'bg-prune-50 ring-2 ring-prune-300 ring-inset' : 'bg-loam-100/70 hover:bg-loam-200/60',
                  )}
                >
                  {/* design-lint-ok: the whole folded column is the button that unfolds it */}
                  <button
                    type="button"
                    onClick={() => toggleCompleted(true)}
                    aria-expanded={false}
                    aria-label={t('team_board.frieze.unfold_completed', { count: all.length })}
                    title={t('team_board.frieze.unfold_completed', { count: all.length })}
                    className="flex w-full items-center gap-1.5 rounded-2xl p-3 text-sm font-semibold text-loam-800 focus-visible:outline-2 focus-visible:outline-prune-600 xl:flex-col xl:gap-3 xl:px-0 xl:py-3"
                  >
                    <PhaseIcon phase={phase} className={clsx('h-6 w-6 shrink-0', all.length ? phaseTone(phase) : 'text-loam-300')} />
                    <span className="xl:[writing-mode:vertical-rl]">{t(`team_board.phases.${phase}`)}</span>
                    <span className="ml-auto rounded-full bg-white px-2 text-sm font-semibold text-loam-600 tabular-nums xl:order-first xl:ml-0">{all.length}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-loam-400 xl:hidden" aria-hidden />
                    <ChevronsLeft className="mt-auto hidden h-4 w-4 shrink-0 text-loam-400 xl:block" aria-hidden />
                  </button>
                </div>
              )
            }
            return (
              <div
                key={phase}
                {...dropTarget}
                className={clsx(
                  'group/column flex min-w-0 flex-col gap-2 rounded-2xl p-2 transition-colors xl:flex-1 xl:basis-0',
                  overColumn ? 'bg-prune-50 ring-2 ring-prune-300 ring-inset' : 'bg-loam-100/70',
                )}
              >
                <h3 className="flex items-center gap-1.5 px-1 pt-1 text-sm font-semibold text-loam-800">
                  <PhaseIcon phase={phase} className={clsx('h-6 w-6', column.length ? phaseTone(phase) : 'text-loam-300')} />
                  {t(`team_board.phases.${phase}`)}
                  <span className="ml-auto rounded-full bg-white px-2 text-sm font-semibold text-loam-600 tabular-nums">{all.length}</span>
                  <IconButton size="sm" label={t('team_board.sections.add', { phase: t(`team_board.phases.${phase}`) })} onClick={() => setNaming({ phase })} className="-my-1 text-loam-400 focus-visible:opacity-100 xl:opacity-0 xl:group-hover/column:opacity-100">
                    <Plus />
                  </IconButton>
                  {phase === 'completed' && (
                    <IconButton size="sm" label={t('team_board.frieze.fold_completed')} aria-expanded onClick={() => toggleCompleted(false)} className="-my-1 -mr-1">
                      <ChevronUp className="xl:hidden" /><ChevronsRight className="hidden xl:block" />
                    </IconButton>
                  )}
                </h3>
                {loose.map(card)}
                {ownSections.map((section, i) => {
                  const inside = awake.filter((p) => p.sectionId === section.id)
                  const slot = { section: section.id }
                  return (
                    <CardGroup key={section.id} {...slotTarget(phase, slot)} over={over === slotKey(phase, slot)}
                      heading={<>
                        <span className="min-w-0 truncate font-hand text-xl leading-none text-loam-800">{section.name}</span>
                        <span className="h-px flex-1 bg-loam-300" aria-hidden />
                        <SectionMenu section={section} first={i === 0} last={i === ownSections.length - 1} onRename={() => setNaming({ phase, section })} />
                      </>}
                    >
                      {inside.map(card)}
                      {inside.length === 0 && (
                        <p className={clsx('rounded-xl border border-dashed px-3 py-2 text-center font-hand text-lg leading-tight', dragged != null ? 'border-prune-300 text-prune-500' : 'border-loam-300 text-loam-400')}>
                          {t('team_board.frieze.empty_column')}
                        </p>
                      )}
                    </CardGroup>
                  )
                })}
                {showHold && (
                  <CardGroup {...slotTarget(phase, 'hold')} over={over === slotKey(phase, 'hold')} quiet
                    heading={<>
                      <span title={t('team_board.sections.on_hold_hint')} className="inline-flex items-center gap-1 text-sm font-semibold text-loam-500">
                        <Moon className="h-4 w-4" aria-hidden />{t('team_board.sections.on_hold')}
                      </span>
                      <span className="h-px flex-1 border-t border-dashed border-loam-300" aria-hidden />
                    </>}
                  >
                    {asleep.map(card)}
                    {asleep.length === 0 && (
                      <p className="rounded-xl border border-dashed border-prune-300 px-3 py-2 text-center font-hand text-lg leading-tight text-prune-500">{t('team_board.sections.drop_to_hold')}</p>
                    )}
                  </CardGroup>
                )}
                {old.length > 0 && (
                  <button type="button" onClick={() => setShowOld((v) => !v)} className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-prune-700 hover:bg-white/70">
                    {showOld ? t('team_board.frieze.hide_old') : t('team_board.frieze.show_old', { count: old.length })}
                  </button>
                )}
                {all.length === 0 && (
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
      <SectionDialog naming={naming} onClose={() => setNaming(null)} />
      <ProjectDialog project={editingNow} onClose={() => setEditing(null)} />
      <ProjectPreview
        project={previewNow}
        onClose={() => setPreviewing(null)}
        onSettings={(project) => setEditing(project)}
        onNextStep={(project) => setMoving({ project, phase: project.phase })}
      />
    </BoardSection>
  )
}

function ProjectCard({ project, dragging, onDragStart, onDragEnd, onMove, onSettings, onPreview }: {
  project: BoardProject
  dragging: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onMove: (phase: BoardPhase) => void
  onSettings: () => void
  /** A click on the card opens its preview; the map is one more click away. */
  onPreview: () => void
}) {
  const { today, sections } = useBoard()
  const sleepsIn = project.sectionId != null ? sections.find((s) => s.id === project.sectionId && s.phase === project.phase) : undefined
  const days = Math.max(0, daysBetween(project.phaseChangedAt.slice(0, 10), today))
  const settled = project.phase === 'co_management' || project.phase === 'completed'
  const stuck = !settled && !project.onHoldSince && days > STUCK_DAYS
  const promiseIn = project.promisedOn ? daysBetween(today, project.promisedOn) : null

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={project.name}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, [role="menu"]')) onPreview() }}
      className={clsx(
        'group relative cursor-grab space-y-2 rounded-xl border border-loam-200 bg-[#fffdf7] p-2.5 shadow-[0_1px_0_var(--color-loam-200)] transition active:cursor-grabbing',
        'hover:border-loam-300 hover:shadow-md',
        dragging && 'rotate-1 opacity-50',
        project.onHoldSince && 'opacity-60 saturate-50',
      )}
    >
      <div className="flex items-start gap-1">
        {/* design-lint-ok: the card's title is the way into its preview, drawn as the title it was */}
        <button type="button" onClick={onPreview} draggable={false} aria-label={t('team_board.preview.open', { name: project.name })} className="min-w-0 flex-1 text-left font-serif text-lg leading-tight text-loam-900 hover:text-prune-700">
          {project.name}
        </button>
        <CardMenu project={project} onMove={onMove} onSettings={onSettings} />
      </div>
      <div className="flex items-center gap-2">
        {(project.lead || project.crew.length > 0) && (
          <button type="button" onClick={onSettings} className="min-w-0 rounded-full focus-visible:outline-2 focus-visible:outline-prune-600" aria-label={t('team_board.frieze.settings')}>
            <Faces lead={project.lead} crew={project.crew} />
          </button>
        )}
        <span
          title={t('team_board.frieze.in_column_since', { count: days })}
          className={clsx('ml-auto shrink-0 text-sm tabular-nums', stuck ? 'rounded-full bg-humus-50 px-2 font-semibold text-humus-800' : 'text-loam-500')}
        >
          {project.phase === 'completed' ? null : t('team_board.frieze.days', { count: days })}
        </span>
      </div>
      {/* In « En veille », the section it will wake up in. */}
      {project.onHoldSince && sleepsIn && (
        <p className="inline-flex items-center gap-1 text-sm text-loam-600"><CornerDownRight className="h-4 w-4" aria-hidden />{sleepsIn.name}</p>
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
    </article>
  )
}

/** « … »: move to a column (touch, keyboard), the project's settings, its map. */
function CardMenu({ project, onMove, onSettings }: { project: BoardProject; onMove: (phase: BoardPhase) => void; onSettings: () => void }) {
  const { phases, sections, saveProject } = useBoard()
  const ownSections = columnSections(sections, project.phase)
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
            <MenuItem key={phase} onClick={pick(() => onMove(phase))}>
              <PhaseIcon phase={phase} className={clsx('h-5 w-5', phaseTone(phase))} />{t(`team_board.phases.${phase}`)}
            </MenuItem>
          ))}
          {ownSections.length > 0 && <>
            <div className="my-1.5 border-t border-loam-100" />
            <p className="px-2.5 pt-1 pb-1.5 font-semibold text-loam-500">{t('team_board.sections.place_in')}</p>
            {[...ownSections.map((s) => ({ id: s.id as number | null, name: s.name })), { id: null, name: t('team_board.sections.none') }]
              .filter((s) => s.id !== project.sectionId)
              .map((s) => (
                <MenuItem key={s.id ?? 'none'} onClick={pick(() => void saveProject(project, { section_id: s.id }))}>
                  <CornerDownRight className="h-4 w-4 text-loam-500" />{s.name}
                </MenuItem>
              ))}
          </>}
          <div className="my-1.5 border-t border-loam-100" />
          <MenuItem onClick={pick(() => void saveProject(project, { on_hold: !project.onHoldSince }))}>
            {project.onHoldSince ? <Sun className="h-4 w-4 text-loam-500" /> : <Moon className="h-4 w-4 text-loam-500" />}
            {t(project.onHoldSince ? 'team_board.sections.wake' : 'team_board.sections.hold')}
          </MenuItem>
          <MenuItem onClick={pick(onSettings)}>
            <Settings2 className="h-4 w-4 text-loam-500" />{t('team_board.frieze.settings')}
          </MenuItem>
          <MenuItem onClick={pick(() => void saveProject(project, { own_place: true }))}>
            <Trees className="h-4 w-4 text-loam-500" />{t('team_board.places.make_place')}
          </MenuItem>
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
 * person and a date (who gets an e-mail).
 */
function MoveDialog({ move, onClose }: { move: Move | null; onClose: () => void }) {
  const { members, today, sections, saveProject } = useBoard()
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
  const change: ProjectChange = samePhase ? {} : { phase: move.phase, ...move.change }
  const into = change.section_id != null ? sections.find((s) => s.id === change.section_id) : undefined

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
          {into && <span className="truncate text-loam-500">· {into.name}</span>}
          {change.on_hold && <span className="inline-flex shrink-0 items-center gap-1 text-loam-500">· <Moon className="h-4 w-4" aria-hidden />{t('team_board.sections.on_hold')}</span>}
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

/** A group of cards inside a column (a section, « En veille »), and a drop target of its own. */
function CardGroup({ heading, over, quiet, children, onDragOver, onDrop }: {
  heading: ReactNode
  over: boolean
  /** « En veille »: drawn quieter than the team's sections. */
  quiet?: boolean
  children: ReactNode
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}) {
  return (
    <div onDragOver={onDragOver} onDrop={onDrop} className={clsx('-mx-1 space-y-2 rounded-xl px-1 pb-1 transition-colors', quiet && 'mt-1', over && 'bg-prune-100/70 ring-2 ring-prune-400 ring-inset')}>
      <div className="flex items-center gap-2 px-1 pt-2">{heading}</div>
      {children}
    </div>
  )
}

/** Changes the sections of one column on the server, then on the board. */
function useSections() {
  const { teamId, notify, setColumnSections } = useBoard()
  return async function call(phase: BoardPhase, path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: object, done?: string) {
    try {
      const { sections } = await api<{ sections: Section[] }>(`${sectionsBase(teamId)}${path}`, { method, body })
      setColumnSections?.(phase, sections)
      notify(done ?? t('team_board.frieze.saved'))
      return true
    } catch (e) {
      notify((e as Error).message || t('team_board.frieze.error'), 'error')
      return false
    }
  }
}

/** A section's « … »: rename, one place up or down, delete (its projects stay in the column). */
function SectionMenu({ section, first, last, onRename }: { section: Section; first: boolean; last: boolean; onRename: () => void }) {
  const call = useSections()
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
  const shift = (by: number) => void call(section.phase, `/${section.id}`, 'PATCH', { section: { shift: by } })
  async function remove() {
    const ok = await confirmAction({
      title: t('team_board.sections.delete_confirm', { name: section.name }),
      body: t('team_board.sections.delete_body'),
      confirmLabel: t('team_board.sections.delete'),
      tone: 'danger',
    })
    if (ok) void call(section.phase, `/${section.id}`, 'DELETE', undefined, t('team_board.sections.deleted'))
  }

  return (
    <div ref={ref} className="relative -my-1 shrink-0">
      <IconButton size="sm" label={t('team_board.sections.menu', { name: section.name })} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal />
      </IconButton>
      {open && (
        <div role="menu" className="absolute top-8 right-0 z-30 w-52 rounded-xl border border-loam-200 bg-white p-1.5 text-sm shadow-xl">
          <MenuItem onClick={pick(onRename)}><Pencil className="h-4 w-4 text-loam-500" />{t('team_board.sections.rename')}</MenuItem>
          {!first && <MenuItem onClick={pick(() => shift(-1))}><ArrowUp className="h-4 w-4 text-loam-500" />{t('team_board.sections.up')}</MenuItem>}
          {!last && <MenuItem onClick={pick(() => shift(1))}><ArrowDown className="h-4 w-4 text-loam-500" />{t('team_board.sections.down')}</MenuItem>}
          <div className="my-1.5 border-t border-loam-100" />
          <MenuItem danger onClick={pick(() => void remove())}><Trash2 />{t('team_board.sections.delete')}</MenuItem>
        </div>
      )}
    </div>
  )
}

/** Names a new section of a column, or renames one. */
function SectionDialog({ naming, onClose }: { naming: { phase: BoardPhase; section?: Section } | null; onClose: () => void }) {
  const call = useSections()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setName(naming?.section?.name ?? ''); setBusy(false) }, [naming])

  if (!naming) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>
  const { phase, section } = naming
  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    const ok = section
      ? await call(phase, `/${section.id}`, 'PATCH', { section: { name: name.trim() } })
      : await call(phase, '', 'POST', { section: { phase, name: name.trim() } }, t('team_board.sections.created'))
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={section ? t('team_board.sections.rename_title') : t('team_board.sections.new_title', { phase: t(`team_board.phases.${phase}`) })}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
        <Button onClick={() => void submit()} disabled={busy || !name.trim()}>{section ? t('team_board.sections.save') : t('team_board.sections.create')}</Button>
      </>}
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="space-y-3">
        {!section && <p className="text-sm text-loam-600">{t('team_board.sections.new_hint')}</p>}
        <Field label={t('team_board.sections.name')}>
          <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t(`team_board.sections.examples.${phase}`)} />
        </Field>
        <button type="submit" hidden />
      </form>
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
