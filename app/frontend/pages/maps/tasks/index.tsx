import { Head, Link, usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowDown, ArrowLeft, ArrowUp, Check, ExternalLink, GripVertical, MapPinned, MoreHorizontal, Pencil, Plus, Sprout, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { inputClass } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import { hasTag, tagCounts, UNTAGGED } from '@/map/tags/tags'
import { formatMonth, monthOfDay, parseDay } from '@/tasks/dates'
import { AssigneeBadge, CheckButton, DueBadge, TagChip, TagEditor, YearStrip } from '@/tasks/parts'
import type { Board, Participant, TaskData, TaskListData } from '@/tasks/types'
import type { CurrentUser } from '@/types'

type Props = Board & {
  map: { id: number; name: string; role: string }
  participants: Participant[]
  canEdit: boolean
  today: string
}

// Semisto's default lists, in the order of the journey's steps (TaskList::Defaults).
const STEPS = ['observe', 'map', 'design', 'plant']

type AssigneeFilter = 'all' | 'me' | 'none' | number

const tagged = (task: TaskData) => ({ properties: { tags: task.tags } })

/**
 * « Tâches » of a map: lists of tasks (Semisto's four by default, one per
 * step), each task with who does it, for when, and its tags. The year strip
 * above shows when things fall due, season by season. Editors manage
 * everything; the person a task is given to may tick it.
 */
export default function MapTasks({ map, lists: initialLists, tasks: initialTasks, participants, canEdit, today }: Props) {
  const { currentUser } = usePage().props as unknown as { currentUser: CurrentUser }
  const [board, setBoard] = useState<Board>({ lists: initialLists, tasks: initialTasks })
  const [error, setError] = useState<string | null>(null)
  const [assignee, setAssignee] = useState<AssigneeFilter>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [month, setMonth] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [newList, setNewList] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)

  const base = `/maps/${map.id}`
  async function run(request: Promise<{ board: Board }>) {
    try {
      const res = await request
      setBoard(res.board)
      setError(null)
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('tasks.errors.generic'))
      setBoard((b) => ({ ...b }))
      return false
    }
  }

  const updateTask = (task: TaskData, attrs: Record<string, unknown>) =>
    run(api(`${base}/tasks/${task.id}`, { method: 'PATCH', body: { task: attrs } }))

  function toggle(task: TaskData) {
    const done = !task.completedAt
    setBoard((b) => ({ ...b, tasks: b.tasks.map((x) => (x.id === task.id ? { ...x, completedAt: done ? new Date().toISOString() : undefined, completedBy: done ? currentUser.name : undefined } : x)) }))
    void updateTask(task, { completed: done })
  }

  const createTask = (list: TaskListData, title: string) =>
    run(api(`${base}/tasks`, { method: 'POST', body: { task: { task_list_id: list.id, title } } }))
  const deleteTask = (task: TaskData) => {
    if (!window.confirm(t('tasks.task.delete_confirm', { title: task.title }))) return
    setOpenId(null)
    void run(api(`${base}/tasks/${task.id}`, { method: 'DELETE' }))
  }
  const moveTask = (task: TaskData, list: TaskListData, position: number) =>
    run(api(`${base}/tasks/${task.id}`, { method: 'PATCH', body: { task: { task_list_id: list.id, position } } }))

  const createList = (name: string) => run(api(`${base}/task_lists`, { method: 'POST', body: { task_list: { name } } }))
  const updateList = (list: TaskListData, attrs: { name?: string; position?: number }) =>
    run(api(`${base}/task_lists/${list.id}`, { method: 'PATCH', body: { task_list: attrs } }))
  const deleteList = (list: TaskListData, count: number) => {
    if (!window.confirm(t('tasks.lists.delete_confirm', { name: list.name, count }))) return
    void run(api(`${base}/task_lists/${list.id}`, { method: 'DELETE' }))
  }
  const addDefaults = () => run(api(`${base}/task_lists/defaults`, { method: 'POST' }))

  const tags = useMemo(() => tagCounts(board.tasks.map(tagged)), [board.tasks])
  const suggestions = useMemo(() => tags.map((c) => c.tag), [tags])

  const matches = (task: TaskData) => {
    if (assignee === 'me' && task.assignee?.id !== currentUser.id) return false
    if (assignee === 'none' && task.assignee) return false
    if (typeof assignee === 'number' && task.assignee?.id !== assignee) return false
    if (tag && !hasTag(tagged(task), tag)) return false
    if (month && (!task.dueOn || monthOfDay(task.dueOn) !== month)) return false
    if (overdueOnly && (task.completedAt || !task.dueOn || task.dueOn >= today)) return false
    return true
  }
  const filtering = assignee !== 'all' || tag != null || month != null || overdueOnly
  const done = board.tasks.filter((x) => x.completedAt).length
  const overdue = board.tasks.filter((x) => !x.completedAt && x.dueOn && x.dueOn < today).length
  const visibleCount = board.tasks.filter((x) => matches(x) && (showDone || !x.completedAt)).length

  function onDrop(e: DragEvent, list: TaskListData, index: number) {
    e.preventDefault()
    const task = board.tasks.find((x) => x.id === dragId)
    setDragId(null)
    if (!task) return
    const sameListIndex = task.listId === list.id ? board.tasks.filter((x) => x.listId === list.id).findIndex((x) => x.id === task.id) : -1
    if (sameListIndex === index) return
    void moveTask(task, list, sameListIndex >= 0 && sameListIndex < index ? index - 1 : index)
  }

  const monthLabel = month ? formatMonth(parseDay(`${month}-01`).getFullYear(), parseDay(`${month}-01`).getMonth()) : ''

  return (
    <div className="mx-auto max-w-4xl">
      <Head title={t('tasks.page_title', { map: map.name })} />
      <Link href={base} className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-800">
        <ArrowLeft className="h-4 w-4" />{t('tasks.back_to_map')}
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl">{t('tasks.title')}</h1>
          <p className="text-loam-500">{map.name}</p>
        </div>
        {board.tasks.length > 0 && (
          <p className="text-sm font-medium text-loam-700">{t('tasks.progress', { done, total: board.tasks.length })}</p>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-loam-600">{t('tasks.intro')}</p>
      {!canEdit && <p className="mt-2 text-sm text-loam-500">{t('tasks.read_only')}</p>}

      {error && <p role="alert" className="mt-4 rounded-xl bg-clay-50 px-4 py-2 text-sm text-clay-700">{error}</p>}

      {board.lists.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t('tasks.empty.title')}
            action={canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => void addDefaults()}><Sprout className="h-4 w-4" />{t('tasks.empty.add_defaults')}</Button>
                <Button variant="secondary" onClick={() => setNewList(true)}>{t('tasks.empty.add_list')}</Button>
              </div>
            )}
          >
            {t('tasks.empty.body')}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <YearStrip tasks={board.tasks} today={today} month={month} onMonth={setMonth} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3" role="group" aria-label={t('tasks.filters.label')}>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-loam-700">
              {t('tasks.filters.assignee')}
              <select
                value={String(assignee)}
                onChange={(e) => { const v = e.target.value; setAssignee(v === 'all' || v === 'me' || v === 'none' ? v : Number(v)) }}
                className={inputClass + ' w-auto py-1.5'}
              >
                <option value="all">{t('tasks.filters.everyone')}</option>
                <option value="me">{t('tasks.filters.me')}</option>
                {participants.filter((p) => p.id !== currentUser.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="none">{t('tasks.filters.unassigned')}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-loam-700">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="rounded border-loam-300 text-prune-600 focus:ring-prune-600" />
              {t('tasks.filters.show_done')}
            </label>
            {overdue > 0 && (
              <button
                type="button" aria-pressed={overdueOnly} onClick={() => setOverdueOnly((v) => !v)}
                className={clsx('rounded-full px-2.5 py-1 text-sm font-medium', overdueOnly ? 'bg-clay-600 text-white' : 'bg-clay-50 text-clay-700 hover:bg-clay-100')}
              >
                {t('tasks.filters.overdue', { count: overdue })}
              </button>
            )}
            {month && <span className="rounded-full bg-prune-50 px-2.5 py-1 text-sm font-medium text-prune-700">{t('tasks.year.month_filter', { month: monthLabel })}</span>}
          </div>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t('tags.filter_label')}>
              {[{ tag: null as string | null, label: t('tags.all') }, ...tags.map((c) => ({ tag: c.tag, label: `${c.tag} · ${c.count}` })), { tag: UNTAGGED, label: t('tags.untagged') }].map((chip) => (
                <button
                  key={chip.tag ?? 'all'} type="button" aria-pressed={tag === chip.tag}
                  onClick={() => setTag(tag === chip.tag || chip.tag == null ? null : chip.tag)}
                  className={clsx('rounded-full px-3 py-1 text-sm font-medium', tag === chip.tag ? 'bg-prune-600 text-white' : 'bg-loam-100 text-loam-600 hover:bg-loam-200')}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {filtering && visibleCount === 0 && <p className="mt-6 text-loam-500">{t('tasks.filters.no_match')}</p>}

          <div className="mt-6 space-y-5">
            {board.lists.map((list, index) => {
              const all = board.tasks.filter((x) => x.listId === list.id)
              const shown = all.filter((x) => matches(x) && (showDone || !x.completedAt))
              if (filtering && shown.length === 0) return null
              return (
                <ListSection
                  key={list.id} list={list} all={all} shown={shown} today={today} canEdit={canEdit}
                  filtering={filtering} first={index === 0} last={index === board.lists.length - 1} hiddenDone={showDone ? 0 : all.filter((x) => x.completedAt && matches(x)).length}
                  openId={openId} setOpenId={setOpenId} currentUserId={currentUser.id}
                  onToggle={toggle} onCreate={(title) => createTask(list, title)}
                  onRename={(name) => updateList(list, { name })} onMove={(delta) => void updateList(list, { position: index + delta })}
                  onDelete={() => deleteList(list, all.length)}
                  dragId={dragId} setDragId={setDragId} onDrop={(e, i) => onDrop(e, list, i)}
                  renderDetail={(task) => (
                    <TaskDetail
                      task={task} lists={board.lists} participants={participants} suggestions={suggestions} mapId={map.id} today={today}
                      onSave={(attrs) => updateTask(task, attrs)}
                      onMove={(listId) => { const target = board.lists.find((l) => l.id === listId); if (target) void moveTask(task, target, board.tasks.filter((x) => x.listId === listId).length) }}
                      onDelete={() => deleteTask(task)} onClose={() => setOpenId(null)}
                    />
                  )}
                />
              )
            })}
          </div>
        </>
      )}

      {canEdit && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {newList
            ? <NewListForm onCancel={() => setNewList(false)} onCreate={async (name) => { if (await createList(name)) setNewList(false) }} />
            : board.lists.length > 0 && <Button variant="secondary" onClick={() => setNewList(true)}><Plus className="h-4 w-4" />{t('tasks.lists.new')}</Button>}
          {board.lists.length > 0 && board.lists.filter((l) => l.key).length < 4 && (
            <Button variant="ghost" onClick={() => void addDefaults()}><Sprout className="h-4 w-4" />{t('tasks.add_defaults_again')}</Button>
          )}
        </div>
      )}
    </div>
  )
}

function ListSection({
  list, all, shown, today, canEdit, filtering, first, last, hiddenDone, openId, setOpenId, currentUserId,
  onToggle, onCreate, onRename, onMove, onDelete, dragId, setDragId, onDrop, renderDetail,
}: {
  list: TaskListData; all: TaskData[]; shown: TaskData[]; today: string; canEdit: boolean; filtering: boolean; first: boolean; last: boolean; hiddenDone: number
  openId: number | null; setOpenId: (id: number | null) => void; currentUserId: number
  onToggle: (task: TaskData) => void; onCreate: (title: string) => Promise<boolean>
  onRename: (name: string) => Promise<boolean>; onMove: (delta: number) => void; onDelete: () => void
  dragId: number | null; setDragId: (id: number | null) => void; onDrop: (e: DragEvent, index: number) => void
  renderDetail: (task: TaskData) => ReactNode
}) {
  const [renaming, setRenaming] = useState(false)
  const [menu, setMenu] = useState(false)
  const done = all.filter((x) => x.completedAt).length
  const percent = all.length ? Math.round((done / all.length) * 100) : 0
  const complete = all.length > 0 && done === all.length
  const [unfolded, setUnfolded] = useState(false)
  // A finished list folds to its header, unless filters or « tâches faites » ask for its tasks.
  const folded = complete && !unfolded && !filtering && hiddenDone > 0
  const step = list.key ? STEPS.indexOf(list.key) + 1 : 0

  return (
    <section
      aria-labelledby={`list-${list.id}`}
      className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5"
      onDragOver={(e) => dragId != null && e.preventDefault()}
      onDrop={(e) => onDrop(e, all.length)}
    >
      <header className="flex items-start gap-3">
        {step > 0 && (
          <span
            title={t('tasks.lists.step', { n: step })}
            className={clsx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold', complete ? 'bg-leaf-600 text-white' : 'bg-prune-600 text-white')}
          >
            {complete ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : step}
            <span className="sr-only">{t('tasks.lists.step', { n: step })}</span>
          </span>
        )}
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form onSubmit={async (e) => { e.preventDefault(); const name = new FormData(e.currentTarget).get('name') as string; if (await onRename(name)) setRenaming(false) }}>
              <input name="name" defaultValue={list.name} autoFocus maxLength={80} onBlur={(e) => { void onRename(e.currentTarget.value).then((ok) => ok && setRenaming(false)) }} className={inputClass + ' font-serif text-lg'} aria-label={t('tasks.lists.rename')} />
            </form>
          ) : (
            <h2 id={`list-${list.id}`} className="font-serif text-xl font-semibold text-prune-800">{list.name}</h2>
          )}
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-loam-100" aria-hidden>
              <div className="h-full rounded-full bg-leaf-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-sm tabular-nums text-loam-500">{t('tasks.lists.count', { done, total: all.length })}</span>
          </div>
        </div>
        {canEdit && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={t('tasks.lists.menu')} className="rounded-full p-1.5 text-loam-500 hover:bg-loam-100 hover:text-loam-800">
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <div className="absolute right-0 z-10 mt-1 w-52 rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-loam-900/10" onMouseLeave={() => setMenu(false)}>
                <MenuItem icon={Pencil} label={t('tasks.lists.rename')} onClick={() => { setMenu(false); setRenaming(true) }} />
                {!first && <MenuItem icon={ArrowUp} label={t('tasks.lists.move_up')} onClick={() => { setMenu(false); onMove(-1) }} />}
                {!last && <MenuItem icon={ArrowDown} label={t('tasks.lists.move_down')} onClick={() => { setMenu(false); onMove(1) }} />}
                <MenuItem icon={Trash2} label={t('tasks.lists.delete')} danger onClick={() => { setMenu(false); onDelete() }} />
              </div>
            )}
          </div>
        )}
      </header>

      {folded ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-leaf-800">
          {t('tasks.lists.all_done')}
          <button type="button" onClick={() => setUnfolded(true)} className="font-medium text-prune-700 hover:underline">
            {t('tasks.lists.unfold', { count: all.length })}
          </button>
        </p>
      ) : (
      <ul className="mt-3 divide-y divide-loam-900/5">
        {shown.map((task) => (
          <li
            key={task.id}
            onDragOver={(e) => { if (dragId != null) { e.preventDefault(); e.stopPropagation() } }}
            onDrop={(e) => { e.stopPropagation(); onDrop(e, all.findIndex((x) => x.id === task.id)) }}
            className={clsx(dragId === task.id && 'opacity-40')}
          >
            <TaskRow
              task={task} today={today} open={openId === task.id} canEdit={canEdit}
              canTick={canEdit || task.assignee?.id === currentUserId}
              onToggle={() => onToggle(task)} onOpen={() => setOpenId(openId === task.id ? null : task.id)}
              onDragStart={() => setDragId(task.id)} onDragEnd={() => setDragId(null)}
            />
            {openId === task.id && renderDetail(task)}
          </li>
        ))}
      </ul>
      )}
      {all.length === 0 && <p className="py-2 text-sm text-loam-500">{t('tasks.lists.empty')}</p>}
      {hiddenDone > 0 && !complete && <p className="pt-2 text-sm text-loam-400">{t('tasks.lists.done_hidden', { count: hiddenDone })}</p>}
      {canEdit && !folded && <NewTaskInput onCreate={onCreate} />}
    </section>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-loam-50', danger ? 'text-clay-700' : 'text-loam-700')}>
      <Icon className="h-4 w-4" />{label}
    </button>
  )
}

function TaskRow({ task, today, open, canEdit, canTick, onToggle, onOpen, onDragStart, onDragEnd }: {
  task: TaskData; today: string; open: boolean; canEdit: boolean; canTick: boolean
  onToggle: () => void; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void
}) {
  const done = !!task.completedAt
  return (
    <div
      className={clsx('group flex items-start gap-3 py-2.5', open && 'pb-1')}
      draggable={canEdit}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(task.id)); onDragStart() }}
      onDragEnd={onDragEnd}
    >
      {canEdit && <GripVertical className="mt-1 hidden h-4 w-4 shrink-0 cursor-grab text-loam-300 opacity-0 group-hover:opacity-100 sm:block" aria-label={t('tasks.task.drag')} />}
      <div className="pt-0.5">
        <CheckButton
          done={done} disabled={!canTick} onToggle={onToggle}
          label={t(done ? 'tasks.task.mark_pending' : 'tasks.task.mark_done', { title: task.title })}
        />
      </div>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} aria-expanded={open} className="block w-full text-left">
          <span className={clsx('text-[15px] leading-snug', done ? 'text-loam-400 line-through decoration-loam-300' : 'text-loam-900 group-hover:text-prune-800')}>
            {task.title}
          </span>
          {!done && !open && task.notes && (
            <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-loam-500">{task.notes}</span>
          )}
        </button>
        {!done && task.mapSaysDone && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-leaf-50 px-2 py-0.5 text-sm text-leaf-800">
              <MapPinned className="h-3.5 w-3.5" aria-hidden />{t('tasks.task.map_says_done')}
            </span>
            {canTick && (
              <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold text-leaf-700 ring-1 ring-inset ring-leaf-600 hover:bg-leaf-600 hover:text-white">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />{t('tasks.task.tick_now')}
              </button>
            )}
          </div>
        )}
        {(task.tags.length > 0 || task.dueOn || task.assignee) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {task.dueOn && <DueBadge due={task.dueOn} today={today} done={done} />}
            {task.assignee && <AssigneeBadge name={task.assignee.name} withName />}
            {task.tags.map((tag) => <TagChip key={tag} tag={tag} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskDetail({ task, lists, participants, suggestions, mapId, today, onSave, onMove, onDelete, onClose }: {
  task: TaskData; lists: TaskListData[]; participants: Participant[]; suggestions: string[]; mapId: number; today: string
  onSave: (attrs: Record<string, unknown>) => Promise<boolean>; onMove: (listId: number) => void; onDelete: () => void; onClose: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { setTitle(task.title); setNotes(task.notes ?? '') }, [task.id, task.title, task.notes])
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [])

  const saveTitle = () => { if (title.trim() && title !== task.title) void onSave({ title }) }
  const saveNotes = () => { if (notes !== (task.notes ?? '')) void onSave({ notes }) }
  const field = 'block text-sm font-medium text-loam-700'

  return (
    <div ref={ref} className="mb-3 ml-9 space-y-3 rounded-xl bg-loam-50 p-4 ring-1 ring-loam-900/5">
      <label className="block space-y-1">
        <span className={field}>{t('tasks.task.title_label')}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && saveTitle()} maxLength={200} className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span className={field}>{t('tasks.task.notes')}</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={3} placeholder={t('tasks.task.notes_placeholder')} className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className={field}>{t('tasks.task.assignee')}</span>
          <select value={task.assignee?.id ?? ''} onChange={(e) => void onSave({ assignee_id: e.target.value || null })} className={inputClass}>
            <option value="">{t('tasks.task.nobody')}</option>
            {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={field}>{t('tasks.task.due_on')}</span>
          <input type="date" value={task.dueOn ?? ''} min={task.dueOn && task.dueOn < today ? undefined : today} onChange={(e) => void onSave({ due_on: e.target.value || null })} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className={field}>{t('tasks.task.list')}</span>
          <select value={task.listId} onChange={(e) => onMove(Number(e.target.value))} className={inputClass}>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-1">
        <span className={field}>{t('tasks.task.tags')}</span>
        <TagEditor tags={task.tags} suggestions={suggestions} onChange={(tags) => void onSave({ tags })} />
      </div>
      {task.completedAt && task.completedBy && (
        <p className="text-sm text-leaf-800">{t('tasks.task.done_by', { name: task.completedBy, when: relativeTime(task.completedAt) })}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-2">
          {task.panel && (
            <Link href={`/maps/${mapId}?panel=${task.panel}`} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-prune-700 hover:bg-prune-50">
              <ExternalLink className="h-4 w-4" />{t('tasks.task.open_in_map')}
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-clay-700 hover:bg-clay-50"><Trash2 className="h-4 w-4" />{t('tasks.task.delete')}</Button>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>{t('tasks.task.close')}</Button>
      </div>
    </div>
  )
}

function NewTaskInput({ onCreate }: { onCreate: (title: string) => Promise<boolean> }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    if (await onCreate(title)) setTitle('')
    setBusy(false)
  }
  return (
    <form onSubmit={submit} className="mt-2 flex items-center gap-3">
      <Plus className="h-5 w-5 shrink-0 text-loam-400" aria-hidden />
      <input
        value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
        placeholder={t('tasks.task.add_placeholder')} aria-label={t('tasks.task.add')}
        className="w-full rounded-lg border-0 bg-transparent px-0 py-2 text-[15px] text-loam-900 placeholder:text-loam-400 focus:ring-0"
      />
    </form>
  )
}

function NewListForm({ onCreate, onCancel }: { onCreate: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) void onCreate(name) }} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} placeholder={t('tasks.lists.new_placeholder')} aria-label={t('tasks.lists.new')} className={inputClass + ' sm:w-80'} />
      <Button type="submit" disabled={!name.trim()}>{t('tasks.lists.create')}</Button>
      <Button variant="ghost" onClick={onCancel}>{t('tasks.task.close')}</Button>
    </form>
  )
}
