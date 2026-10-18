import { ListTodo, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { AssigneeBadge, assigneeName, CheckButton, DueBadge } from '@/tasks/parts'
import type { TaskData, TaskListData } from '@/tasks/types'
import type { MapFeature } from '@/types'

type Response = { tasks: TaskData[]; lists: TaskListData[] }

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * « À faire »: the tasks of the map that are about this element (a plant, a
 * hedge…), to tick, and a new one added from here, linked to it. The same
 * tasks are on the « Tâches » page, where they show this element.
 */
export default function FeatureTasksSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const featureId = Number(feature.properties.id)
  const base = `/maps/${editor.map.id}/tasks`
  const [data, setData] = useState<Response | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback((signal?: AbortSignal) => {
    api<Response>(`${base}.json?feature_id=${featureId}`, { signal }).then(setData).catch(() => undefined)
  }, [base, featureId])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function toggle(task: TaskData) {
    try {
      await api(`${base}/${task.id}`, { method: 'PATCH', body: { task: { completed: !task.completedAt } } })
      load()
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  if (!data) return null
  const pending = data.tasks.filter((task) => !task.completedAt)
  const done = data.tasks.length - pending.length
  if (data.tasks.length === 0 && !editor.canEdit) return null

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3 text-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-loam-500">{t('tasks.feature_section.title')}</h3>
      {data.tasks.length === 0 && !adding && <p className="text-loam-500">{t('tasks.feature_section.empty')}</p>}
      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((task) => {
            const others = (task.features ?? []).filter((f) => f.id !== featureId)
            return (
              <li key={task.id} className="flex gap-2">
                <CheckButton done={false} disabled={!editor.canEdit} onToggle={() => void toggle(task)} label={t('tasks.task.mark_done', { title: task.title })} />
                <div className="min-w-0 flex-1">
                  <p className="leading-snug text-loam-900">{task.title}</p>
                  {task.notes && <p className="line-clamp-2 text-loam-500">{task.notes}</p>}
                  {(task.dueOn || task.assignee) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {task.dueOn && <DueBadge due={task.dueOn} today={todayIso()} />}
                      {task.assignee && <AssigneeBadge name={assigneeName(task.assignee)} url={task.assignee.avatarUrl} withName />}
                    </div>
                  )}
                  {others.length > 0 && (
                    <p className="mt-0.5 text-loam-500">{t('tasks.feature_section.also', { labels: others.slice(0, 5).map((f) => f.label).join(', ') + (others.length > 5 ? '…' : '') })}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {done > 0 && <p className="text-loam-500">{t('tasks.feature_section.done_count', { count: done })}</p>}
      {editor.canEdit && (adding ? (
        <NewTask base={base} featureId={featureId} lists={data.lists} onDone={(added) => { setAdding(false); if (added) load() }} />
      ) : (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{t('tasks.feature_section.add')}</Button>
      ))}
      {data.tasks.length > 0 && (
        <a href={base} className="inline-flex items-center gap-1.5 text-prune-700 hover:underline"><ListTodo className="h-4 w-4" />{t('tasks.feature_section.open_all')}</a>
      )}
    </section>
  )
}

function NewTask({ base, featureId, lists, onDone }: { base: string; featureId: number; lists: TaskListData[]; onDone: (added: boolean) => void }) {
  const editor = useEditor()
  const [title, setTitle] = useState('')
  const [listId, setListId] = useState<number | null>(lists[lists.length - 1]?.id ?? null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || listId == null) return
    setSaving(true)
    try {
      await api(base, { method: 'POST', body: { task: { task_list_id: listId, title: title.trim(), feature_ids: [featureId] } } })
      editor.notify(t('tasks.feature_section.added'))
      onDone(true)
    } catch (err) {
      editor.notify(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg bg-loam-50 p-2">
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t('tasks.feature_section.title_placeholder')} aria-label={t('tasks.task.title_label')} className={inputClass} />
      {lists.length > 1 && (
        <label className="block space-y-1">
          <span className="block text-sm font-medium text-loam-700">{t('tasks.feature_section.list')}</span>
          <select value={listId ?? ''} onChange={(e) => setListId(Number(e.target.value))} className={inputClass}>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(false)}>{t('common.cancel')}</Button>
        <Button type="submit" size="sm" disabled={saving || !title.trim() || listId == null}>{t('tasks.feature_section.save')}</Button>
      </div>
    </form>
  )
}
