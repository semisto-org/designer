import { Link } from '@inertiajs/react'
import { UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import type { ListedMap } from '@/types/teams'

type Team = { id: number; name: string }

/**
 * Splits the maps list: maps of my teams go to their team's section (every
 * team I belong to gets one, even empty), the others (mine, shared with me,
 * or in a team I am not part of) stay in the main list.
 */
export function groupMapsByTeam(maps: ListedMap[], teams: Team[]) {
  const ids = new Set(teams.map((team) => team.id))
  const own = maps.filter((map) => map.teamId == null || !ids.has(map.teamId))
  const byTeam = teams.map((team) => ({ team, maps: maps.filter((map) => map.teamId === team.id) }))
  return { own, byTeam }
}

/** One team's maps in "Mes cartes". */
export function TeamMapsSection({ team, empty, children }: { team: Team; empty: boolean; children: ReactNode }) {
  const headingId = `team-maps-${team.id}`
  return (
    <section aria-labelledby={headingId} className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-loam-200 pb-2">
        <h2 id={headingId} className="flex min-w-0 items-center gap-2 text-lg">
          <UsersRound className="h-5 w-5 shrink-0 text-prune-500" aria-hidden="true" />
          <span className="truncate">{t('teams.maps_index.section', { name: team.name })}</span>
        </h2>
        <Link href={`/teams/${team.id}`} className="text-sm font-medium text-prune-700 hover:text-prune-800">
          {t('teams.maps_index.open_team')}
        </Link>
      </div>
      {empty ? <p className="mt-4 text-sm text-loam-500">{t('teams.maps_index.empty')}</p> : children}
    </section>
  )
}
