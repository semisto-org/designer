import { Head, Link, usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/ui/Card'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { BUCKETS, bucketOf } from '@/tasks/dates'
import { AssigneeBadge, CheckButton, DueBadge, TagChip } from '@/tasks/parts'
import type { TaskWithMap } from '@/tasks/types'
import type { CurrentUser } from '@/types'

type Scope = { type: 'me' } | { type: 'team'; id: number; name: string }
type Props = { scope: Scope; teams: { id: number; name: string }[]; tasks: TaskWithMap[]; today: string }
type Grouping = 'due' | 'map' | 'assignee'

/**
 * « Tâches »: what is left to do across maps. « À moi » gathers the tasks
 * given to me; a team's tab shows every task of its maps, by due date, by
 * map or by person: the team's project page.
 */
export default function Tasks({ scope, teams, tasks: initial, today }: Props) {
  const { currentUser } = usePage().props as unknown as { currentUser: CurrentUser }
  const [tasks, setTasks] = useState(initial)
  const [grouping, setGrouping] = useState<Grouping>('due')
  const [error, setError] = useState<string | null>(null)

  async function toggle(task: TaskWithMap) {
    const done = !task.completedAt
    setTasks((all) => all.map((x) => (x.id === task.id ? { ...x, completedAt: done ? new Date().toISOString() : undefined } : x)))
    try {
      await api(`/maps/${task.map.id}/tasks/${task.id}`, { method: 'PATCH', body: { task: { completed: done } } })
      setError(null)
    } catch (e) {
      setTasks((all) => all.map((x) => (x.id === task.id ? task : x)))
      setError(e instanceof ApiError ? e.message : t('tasks.errors.generic'))
    }
  }

  const groups: { key: string; title: string; href?: string; items: TaskWithMap[] }[] = (() => {
    if (grouping === 'due') {
      return BUCKETS.map((b) => ({ key: b, title: t(`tasks.mine.buckets.${b}`), items: tasks.filter((x) => bucketOf(x.dueOn, today) === b) }))
    }
    const keyed = new Map<string, { key: string; title: string; href?: string; items: TaskWithMap[] }>()
    for (const task of tasks) {
      const key = grouping === 'map' ? `m${task.map.id}` : `a${task.assignee?.id ?? 0}`
      const title = grouping === 'map' ? task.map.name : task.assignee?.name ?? t('tasks.mine.unassigned')
      const href = grouping === 'map' ? `/maps/${task.map.id}/tasks` : undefined
      if (!keyed.has(key)) keyed.set(key, { key, title, href, items: [] })
      keyed.get(key)!.items.push(task)
    }
    return [...keyed.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  })()

  const tab = (active: boolean) => clsx(
    'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium',
    active ? 'bg-prune-600 text-white' : 'bg-loam-100 text-loam-700 hover:bg-loam-200',
  )

  return (
    <div className="mx-auto max-w-4xl">
      <Head title={t('tasks.mine.page_title')} />
      <h1 className="text-2xl">{t('tasks.mine.title')}</h1>
      <p className="mt-1 text-loam-600">{t('tasks.mine.intro')}</p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1" aria-label={t('tasks.mine.title')}>
          <Link href="/tasks" className={tab(scope.type === 'me')} preserveScroll>{t('tasks.mine.scope_me')}</Link>
          {teams.map((team) => (
            <Link key={team.id} href={`/tasks?team_id=${team.id}`} className={tab(scope.type === 'team' && scope.id === team.id)} preserveScroll>
              {t('tasks.mine.scope_team', { name: team.name })}
            </Link>
          ))}
        </nav>
        <label className="flex items-center gap-2 text-sm text-loam-700">
          {t('tasks.mine.group_by')}
          <select value={grouping} onChange={(e) => setGrouping(e.target.value as Grouping)} className="rounded-lg border-0 py-1.5 text-sm ring-1 ring-inset ring-loam-900/20 focus:ring-2 focus:ring-prune-600">
            <option value="due">{t('tasks.mine.group_due')}</option>
            <option value="map">{t('tasks.mine.group_map')}</option>
            {scope.type === 'team' && <option value="assignee">{t('tasks.mine.group_assignee')}</option>}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-clay-50 px-4 py-2 text-sm text-clay-700">{error}</p>}

      {tasks.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t('tasks.mine.title')}>{t(scope.type === 'me' ? 'tasks.mine.empty_me' : 'tasks.mine.empty_team')}</EmptyState>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.filter((g) => g.items.length > 0).map((group) => (
            <section key={group.key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5" aria-labelledby={`group-${group.key}`}>
              <header className="flex items-baseline justify-between gap-3">
                <h2 id={`group-${group.key}`} className={clsx('font-serif text-xl font-semibold', group.key === 'overdue' ? 'text-clay-700' : 'text-prune-800')}>
                  {group.title} <span className="font-sans text-sm font-normal tabular-nums text-loam-500">{group.items.length}</span>
                </h2>
                {group.href && (
                  <Link href={group.href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
                    {t('tasks.mine.open_map_tasks')}<ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </header>
              <ul className="mt-2 divide-y divide-loam-900/5">
                {group.items.map((task) => {
                  const done = !!task.completedAt
                  return (
                    <li key={task.id} className="flex items-start gap-3 py-2.5">
                      <div className="pt-0.5">
                        <CheckButton done={done} onToggle={() => void toggle(task)} label={t(done ? 'tasks.task.mark_pending' : 'tasks.task.mark_done', { title: task.title })} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/maps/${task.map.id}/tasks`} className={clsx('text-[15px] leading-snug hover:text-prune-800', done ? 'text-loam-400 line-through' : 'text-loam-900')}>
                          {task.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-loam-500">
                          <span>{grouping === 'map' ? task.listName : `${task.map.name} · ${task.listName}`}</span>
                          {task.dueOn && <DueBadge due={task.dueOn} today={today} done={done} />}
                          {task.assignee && task.assignee.id !== currentUser.id && grouping !== 'assignee' && <AssigneeBadge name={task.assignee.name} withName />}
                          {task.tags.map((tag) => <TagChip key={tag} tag={tag} />)}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
