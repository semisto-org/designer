import clsx from 'clsx'
import { Avatar } from '@/collab/Avatar'
import { t } from '@/lib/i18n'
import type { BoardMemberLoad, BoardProject } from '@/types/teamBoard'
import { BoardSection } from './board'

/** One pip per project; from this many on, the meter turns red. */
const PIPS = 8
const HEAVY = 8

/**
 * Who carries what: how many projects each member is involved in, as
 * project manager or in the crew (read live from the frieze), and their
 * tasks of the four weeks to come, so the team knows whether it can take
 * on a new request.
 */
export function People({ people, projects }: { people: BoardMemberLoad[]; projects: BoardProject[] }) {
  const followed = projects.filter((p) => !p.closedAt && p.phase !== 'completed')
  return (
    <BoardSection id="board-people" title={t('team_board.people.title')} hint={t('team_board.people.hint')}>
      <ul className="grid gap-2 md:grid-cols-2">
        {people.map((person) => {
          const involved = followed.filter((p) => p.lead?.id === person.id || p.crew.some((c) => c.id === person.id))
          const heavy = involved.length >= HEAVY
          return (
            <li key={person.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-loam-200 bg-[#fffdf7] px-4 py-3">
              <Avatar name={person.name} url={person.avatarUrl} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="truncate font-semibold text-loam-900">{person.name}</span>
                  {person.you && <span className="text-sm text-loam-400">{t('team_board.people.you')}</span>}
                </p>
                <p className={clsx('text-sm', heavy ? 'font-semibold text-clay-700' : 'text-loam-600')}>
                  {t('team_board.people.involved', { count: involved.length })}
                </p>
                <p className="text-sm text-loam-500">
                  {t('team_board.people.tasks_soon', { count: person.tasksSoon })}
                  {person.overdue > 0 && <span className="font-semibold text-clay-700"> {t('team_board.people.overdue', { count: person.overdue })}</span>}
                </p>
                {involved.length > 0 && <p className="mt-0.5 truncate text-sm text-loam-400">{involved.map((p) => p.name).join(' · ')}</p>}
              </div>
              <span className="flex shrink-0 gap-1" role="img" aria-label={t('team_board.people.involved', { count: involved.length })}>
                {Array.from({ length: PIPS }, (_, i) => (
                  <span key={i} className={clsx('h-5 w-2 rounded-full', i < involved.length ? (heavy ? 'bg-clay-500' : 'bg-leaf-500') : 'bg-loam-200')} />
                ))}
              </span>
            </li>
          )
        })}
      </ul>
    </BoardSection>
  )
}
