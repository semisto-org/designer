import clsx from 'clsx'
import { Check, Plus, Search, UserMinus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { inputClass } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { AssigneeBadge, assigneeKey, assigneeName } from '@/tasks/parts'
import type { Assignee, Participant } from '@/tasks/types'

/** Past this many people, the picker offers a search field. */
const SEARCH_FROM = 8

type Group = 'me' | 'crew' | 'map' | 'team' | 'invited'
const GROUPS: Group[] = ['me', 'crew', 'map', 'team', 'invited']

/**
 * Who does a task, at the right end of its line (Michael, 2026-11-10): the
 * avatar of the person in charge, or a « + » to give it to someone in one
 * click, without opening the task. The « + » shows when the pointer is on
 * the line; on a touch screen, where nothing hovers, it is always there.
 * The list starts with « Moi », then the project's team, the people of the
 * map (a client reading it may have things to do), the rest of the team and
 * those invited who have not joined yet (TaskBoard#participants).
 */
export function AssigneePicker({ assignee, participants, currentUserId, canEdit, onAssign }: {
  assignee?: Assignee
  participants: Participant[]
  currentUserId: number
  canEdit: boolean
  onAssign: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | TouchEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('touchstart', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('touchstart', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])
  useEffect(() => { if (!open) setQuery('') }, [open])

  const current = assigneeKey(assignee)
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const shown = participants.filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.email ?? '').toLowerCase().includes(needle))
    const groupOf = (p: Participant): Group => (p.id === currentUserId ? 'me' : p.id == null ? 'invited' : p.group ?? 'map')
    return GROUPS.map((group) => ({ group, people: shown.filter((p) => groupOf(p) === group) })).filter((g) => g.people.length > 0)
  }, [participants, query, currentUserId])

  if (!canEdit) {
    return assignee ? <span className="shrink-0 pt-0.5"><AssigneeBadge name={assigneeName(assignee)} url={assignee.avatarUrl} /></span> : null
  }

  const pick = (key: string) => {
    setOpen(false)
    if (key !== current) onAssign(key)
  }
  const label = assignee ? t('tasks.picker.change', { name: assigneeName(assignee) }) : t('tasks.picker.assign')

  return (
    <div ref={box} className="relative shrink-0">
      {assignee ? (
        <IconButton label={label} size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className="h-auto! w-auto! p-0.5">
          <AssigneeBadge name={assigneeName(assignee)} url={assignee.avatarUrl} />
        </IconButton>
      ) : (
        <IconButton
          label={label} size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
          className={clsx(
            'border-[1.5px] border-dashed border-loam-300 text-loam-500 hover:border-prune-600 hover:text-prune-700 focus-visible:opacity-100',
            // Nothing hovers on a touch screen: there the « + » stays.
            !open && '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100',
          )}
        >
          <Plus />
        </IconButton>
      )}
      {open && (
        <div role="dialog" aria-label={t('tasks.picker.title')} className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-lg ring-1 ring-loam-900/10">
          <p className="px-2 pb-1 pt-1 font-serif text-lg font-semibold text-prune-800">{t('tasks.picker.title')}</p>
          {participants.length > SEARCH_FROM && (
            <label className="relative mb-1 block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" aria-hidden />
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('tasks.picker.search')} aria-label={t('tasks.picker.search')}
                className={inputClass + ' py-1.5 pl-8'}
              />
            </label>
          )}
          <div className="max-h-80 overflow-y-auto">
            {groups.map(({ group, people }) => (
              <div key={group} className="py-1">
                {group !== 'me' && <p className="px-2 pb-0.5 pt-1 text-sm font-medium text-loam-500">{t(`tasks.picker.groups.${group}`)}</p>}
                {people.map((p) => {
                  const key = assigneeKey(p)
                  const chosen = key === current
                  return (
                    <Button
                      key={key} variant="ghost" size="sm" onClick={() => pick(key)} aria-pressed={chosen}
                      className={clsx('w-full justify-start! font-normal! text-loam-800!', chosen && 'bg-prune-50')}
                    >
                      <AssigneeBadge name={p.name} url={p.avatarUrl} />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {group === 'me' ? t('tasks.picker.me') : p.name}
                        {p.lead && <span className="ml-1.5 text-loam-500">{t('tasks.picker.lead')}</span>}
                        {group === 'map' && p.role === 'viewer' && <span className="ml-1.5 text-loam-500">{t('tasks.picker.viewer')}</span>}
                      </span>
                      {chosen && <Check className="h-4 w-4 text-prune-700" aria-hidden />}
                    </Button>
                  )
                })}
              </div>
            ))}
            {groups.length === 0 && <p className="px-2 py-2 text-sm text-loam-500">{t('tasks.picker.nobody_found')}</p>}
          </div>
          {assignee && (
            <Button variant="ghost" size="sm" onClick={() => pick('')} className="mt-1 w-full justify-start! font-normal! text-loam-600!">
              <UserMinus className="h-4 w-4" aria-hidden />{t('tasks.picker.unassign')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
