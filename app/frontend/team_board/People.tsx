import clsx from 'clsx'
import { Avatar } from '@/collab/Avatar'
import { t } from '@/lib/i18n'
import type { BoardMemberLoad, BoardProject } from '@/types/teamBoard'
import { BoardSection } from './board'

/** One pip per project; from this many on, the meter turns red. */
const PIPS = 8
const HEAVY = 8

/**
 * Who carries what: how many active projects each member is involved in, as
 * project manager or in the crew (read live from the frieze), and their
 * tasks of the four weeks to come, so the team knows whether it can take
 * on a new request. Projects on hold show as pale pips and do not count.
 * Each pip names its project on hover.
 */
export function People({ people, projects }: { people: BoardMemberLoad[]; projects: BoardProject[] }) {
  // A project in co-management or completed no longer weighs on anyone.
  const followed = projects.filter((p) => !p.closedAt && p.phase !== 'completed' && p.phase !== 'co_management')
  return (
    <BoardSection id="board-people" title={t('team_board.people.title')} hint={t('team_board.people.hint')}>
      <ul className="grid gap-2 md:grid-cols-2">
        {people.map((person) => {
          const involved = followed.filter((p) => p.lead?.id === person.id || p.crew.some((c) => c.id === person.id))
          const active = involved.filter((p) => !p.onHoldSince)
          const dormant = involved.filter((p) => p.onHoldSince)
          const heavy = active.length >= HEAVY
          const pips = [...active, ...dormant]
          return (
            <li key={person.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-loam-200 bg-[#fffdf7] px-4 py-3">
              <Avatar name={person.name} url={person.avatarUrl} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="truncate font-semibold text-loam-900">{person.name}</span>
                  {person.you && <span className="text-sm text-loam-400">{t('team_board.people.you')}</span>}
                </p>
                <p className={clsx('text-sm', heavy ? 'font-semibold text-clay-700' : 'text-loam-600')}>
                  {t('team_board.people.involved', { count: active.length })}
                </p>
                <p className="text-sm text-loam-500">
                  {t('team_board.people.tasks_soon', { count: person.tasksSoon })}
                  {person.overdue > 0 && <span className="font-semibold text-clay-700"> {t('team_board.people.overdue', { count: person.overdue })}</span>}
                </p>
              </div>
              <span className="flex shrink-0" aria-label={t('team_board.people.involved', { count: active.length })}>
                {Array.from({ length: Math.max(PIPS, pips.length) }, (_, i) => {
                  const project = pips[i]
                  if (!project) return <span key={i} className="px-0.5"><span className="block h-5 w-2 rounded-full bg-loam-200" /></span>
                  const asleep = !!project.onHoldSince
                  const label = asleep ? `${project.name} (${t('team_board.people.dormant')})` : project.name
                  return (
                    <span key={project.id} tabIndex={0} aria-label={label} className="group relative px-0.5 py-1 outline-none">
                      <span className={clsx('block h-5 w-2 rounded-full transition-transform group-hover:scale-y-110 group-focus-visible:ring-2 group-focus-visible:ring-leaf-400', asleep ? 'bg-leaf-200' : heavy ? 'bg-clay-500' : 'bg-leaf-500')} />
                      <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 hidden w-max max-w-56 rounded-lg bg-loam-900/90 px-2.5 py-1.5 text-sm text-white shadow-lg group-hover:block group-focus:block">
                        {project.name}
                        {asleep && <span className="text-loam-300"> · {t('team_board.people.dormant')}</span>}
                      </span>
                    </span>
                  )
                })}
              </span>
            </li>
          )
        })}
      </ul>
    </BoardSection>
  )
}
