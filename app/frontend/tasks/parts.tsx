import clsx from 'clsx'
import { Calendar, Check, MapPin, X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { inputClass } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { addTag, MAX_TAG_LENGTH, MAX_TAGS, removeTag } from '@/map/tags/tags'
import { dueOf, formatMonth, formatMonthShort, isPlantingMonth, monthOfDay, seasonOf, yearAhead, type Day, type Season } from '@/tasks/dates'
import type { Assignee, Participant, TaskData, TaskFeature } from '@/tasks/types'

/** A stable key for who a task goes to: `u<id>`, or `e<email>` for an invitee. */
export function assigneeKey(person: Assignee | Participant | null | undefined): string {
  if (!person) return ''
  return person.id != null ? `u${person.id}` : `e${person.email ?? ''}`
}

/** What to send to give a task to the person behind `key` (or to nobody). */
export function assigneeParams(key: string): Record<string, unknown> {
  if (key.startsWith('u')) return { assignee_id: Number(key.slice(1)) }
  if (key.startsWith('e')) return { invitee_email: key.slice(1) }
  return { assignee_id: null, invitee_email: null }
}

/** The name shown for an assignee, marked when they have not joined yet. */
export function assigneeName(person: Assignee | Participant): string {
  return person.id == null ? t('tasks.task.invited', { name: person.name }) : person.name
}

/** The round box of a task: an empty ring, a leaf when done. */
export function CheckButton({ done, disabled, label, onToggle }: { done: boolean; disabled?: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={done} aria-label={label} title={label} disabled={disabled}
      onClick={onToggle}
      className={clsx(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-[1.5px] ring-inset transition-colors',
        done ? 'bg-leaf-600 text-white ring-leaf-600' : 'bg-white text-transparent ring-loam-400 hover:text-leaf-600 hover:ring-leaf-600',
        disabled && 'cursor-default opacity-60 hover:text-transparent hover:ring-loam-400',
      )}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  )
}

export function DueBadge({ due, today, done }: { due: Day; today: Day; done?: boolean }) {
  const { kind, date, tone } = dueOf(due, today)
  const label = kind === 'on' ? date : t(`tasks.task.due.${kind}`, { date })
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm',
      done ? 'text-loam-400' : tone === 'overdue' ? 'bg-clay-50 font-medium text-clay-700' : tone === 'soon' ? 'bg-humus-50 text-humus-800' : 'text-loam-600',
    )}>
      <Calendar className="h-3.5 w-3.5" aria-hidden />{label}
    </span>
  )
}

export function initials(name: string): string {
  return name.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('')
}

export function AssigneeBadge({ name, url, withName }: { name: string; url?: string | null; withName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-loam-700" title={name}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" className="h-6 w-6 shrink-0 rounded-full object-cover" /> : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-prune-100 text-[13px] font-semibold text-prune-700" aria-hidden>
        {initials(name)}
      </span>}
      <span className={withName ? '' : 'sr-only'}>{name}</span>
    </span>
  )
}

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-lichen-100 px-2.5 py-0.5 text-sm text-lichen-700">
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 rounded-full p-0.5 hover:bg-lichen-200" aria-label={t('tags.remove', { tag })}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

/** Free tags of a task, suggested from those of the other tasks of the map. */
export function TagEditor({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const listId = useId()
  const [draft, setDraft] = useState('')
  const commit = () => {
    const next = addTag(tags, draft)
    setDraft('')
    if (next !== tags) onChange(next)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }
  const free = suggestions.filter((s) => !tags.some((tag) => tag.toLowerCase() === s.toLowerCase()))
  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {tags.map((tag) => <TagChip key={tag} tag={tag} onRemove={() => onChange(removeTag(tags, tag))} />)}
        </div>
      )}
      {tags.length < MAX_TAGS && (
        <>
          <input
            value={draft} list={listId} maxLength={MAX_TAG_LENGTH}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onBlur={() => draft.trim() && commit()}
            placeholder={t('tasks.task.tags_placeholder')} aria-label={t('tasks.task.tags')}
            className={inputClass + ' py-1.5'}
          />
          <datalist id={listId}>{free.map((tag) => <option key={tag} value={tag} />)}</datalist>
        </>
      )}
    </div>
  )
}

export const SEASON_TINT: Record<Season, string> = {
  winter: 'bg-loam-100/70',
  spring: 'bg-leaf-50',
  summer: 'bg-humus-50',
  autumn: 'bg-clay-50/70',
}

/**
 * « L'année du projet »: the twelve months ahead, tinted by season, with
 * how many tasks fall due in each and the bare-root planting window. A
 * month filters the lists to its due dates.
 */
export function YearStrip({ tasks, today, month, onMonth }: {
  tasks: TaskData[]; today: Day; month: string | null; onMonth: (month: string | null) => void
}) {
  const months = yearAhead(today)
  const counts = new Map<string, number>()
  for (const task of tasks) {
    if (task.completedAt || !task.dueOn || task.dueOn < today) continue
    const key = monthOfDay(task.dueOn)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return (
    <section aria-labelledby="year-strip-title" className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-loam-900/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="year-strip-title" className="font-serif text-lg font-semibold text-prune-800">{t('tasks.year.title')}</h2>
        {month
          ? <button type="button" onClick={() => onMonth(null)} className="text-sm font-medium text-prune-700 hover:underline">{t('tasks.year.clear_month')}</button>
          : <p className="hidden text-sm text-loam-500 sm:block">{t('tasks.year.hint')}</p>}
      </div>
      <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
        <ol className="grid min-w-[42rem] grid-cols-12 gap-1">
          {months.map(({ key, year, month: m }, i) => {
            const count = counts.get(key) ?? 0
            const active = month === key
            const season = seasonOf(m)
            const newSeason = i === 0 || seasonOf(months[i - 1].month) !== season
            return (
              <li key={key} className="flex flex-col">
                <span className="h-5 whitespace-nowrap text-sm text-loam-500">{newSeason ? t(`tasks.year.seasons.${season}`) : ''}</span>
                <button
                  type="button" onClick={() => onMonth(active ? null : key)} aria-pressed={active}
                  aria-label={`${formatMonth(year, m)} ${year} : ${t('tasks.year.due_count', { count })}`}
                  className={clsx(
                    'flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-colors',
                    SEASON_TINT[season],
                    active ? 'ring-2 ring-prune-600' : i === 0 ? 'ring-[1.5px] ring-prune-300' : 'hover:ring-1 hover:ring-loam-400',
                  )}
                >
                  <span className={clsx('text-sm capitalize', i === 0 ? 'font-semibold text-prune-800' : 'text-loam-700')}>
                    {formatMonthShort(year, m)}
                  </span>
                  {count > 0 && <span className="min-w-5 rounded-full bg-prune-600 px-1.5 text-[13px] font-semibold leading-5 tabular-nums text-white">{count}</span>}
                </button>
                <span className={clsx('mt-1 h-1 rounded-full', isPlantingMonth(m) ? 'bg-leaf-500' : 'bg-transparent')} aria-hidden />
              </li>
            )
          })}
        </ol>
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm text-loam-500">
        <span className="inline-block h-1 w-6 rounded-full bg-leaf-500" aria-hidden />{t('tasks.year.planting_window')}
      </p>
    </section>
  )
}

/** An element a task is about: opens the map on it. */
export function FeatureChip({ mapId, feature, onRemove }: { mapId: number; feature: TaskFeature; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-leaf-50 py-0.5 pl-2 pr-2 text-sm text-leaf-800 ring-1 ring-inset ring-leaf-200">
      <a href={`/maps/${mapId}?feature=${feature.id}`} className="inline-flex items-center gap-1 hover:underline" title={t('tasks.task.show_on_map')}>
        <MapPin className="h-3.5 w-3.5" aria-hidden />{feature.label}
      </a>
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 rounded-full p-0.5 hover:bg-leaf-200" aria-label={t('tasks.task.unlink_feature', { label: feature.label })}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
