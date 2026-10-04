import { Link } from '@inertiajs/react'
import { UsersRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { SharingData } from '@/types/collab'

type Props = {
  data: SharingData
  busy: boolean
  /** `/maps/:id` */
  base: string
  /** The sharing dialog's runner: performs the request and adopts the refreshed data. */
  run: (request: () => Promise<SharingData>, success?: string) => Promise<boolean>
}

/**
 * "Équipe" section of the sharing dialog (owner only): confide the map to one
 * of the owner's teams, or take it out. The map stays the owner's and follows
 * the owner's plan; the team's members edit it without taking an editor seat.
 */
export function MapTeamSection({ data, busy, base, run }: Props) {
  const teams = data.teams ?? []
  const current = data.organization
  const [teamId, setTeamId] = useState<number | null>(teams[0]?.id ?? null)
  const ownerLeft = current != null && !teams.some((team) => team.id === current.id)
  const selected = teams.find((team) => team.id === teamId) ?? teams[0]

  function move(id: number | null, success: string) {
    return run(() => api<SharingData>(`${base}/team`, { method: 'PATCH', body: { map: { team_id: id } } }), success)
  }

  function add(e: FormEvent) {
    e.preventDefault()
    if (selected) void move(selected.id, t('teams.map.added', { name: selected.name }))
  }

  function remove() {
    if (!current) return
    if (window.confirm(t('teams.map.remove_confirm', { name: current.name }))) void move(null, t('teams.map.removed'))
  }

  return (
    <section aria-labelledby="share-team" className="space-y-3 border-t border-loam-100 pt-4">
      <h3 id="share-team" className="flex items-center gap-1.5 text-sm font-semibold text-loam-900">
        <UsersRound className="h-4 w-4 text-loam-500" aria-hidden="true" />
        {t('teams.map.title')}
      </h3>
      {current ? (
        <>
          <p className="text-sm text-loam-700">{t('teams.map.in_team', { name: current.name })}</p>
          {ownerLeft && <p className="text-xs text-humus-700">{t('teams.map.owner_left')}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={remove}>{t('teams.map.remove')}</Button>
            {!ownerLeft && (
              <Link href={`/teams/${current.id}`} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-prune-700 hover:bg-prune-50">
                {t('teams.maps_index.open_team')}
              </Link>
            )}
          </div>
        </>
      ) : teams.length > 0 ? (
        <>
          <form onSubmit={add} className="flex flex-wrap gap-2">
            {teams.length > 1 && (
              <Select
                aria-label={t('teams.map.choose')}
                value={selected?.id ?? ''}
                onChange={(e) => setTeamId(Number(e.target.value))}
                className="min-w-0 flex-1 basis-40"
              >
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </Select>
            )}
            <Button type="submit" size="sm" variant="secondary" disabled={busy || !selected}>
              {teams.length > 1 || !selected ? t('teams.map.add') : t('teams.map.add_to', { name: selected.name })}
            </Button>
          </form>
          <p className="text-xs text-loam-500">{t('teams.map.hint')}</p>
        </>
      ) : (
        <p className="text-xs text-loam-500">
          {t('teams.map.no_team')}{' '}
          <Link href="/teams" className="font-medium text-prune-700 underline underline-offset-2 hover:text-prune-800">{t('teams.map.no_team_link')}</Link>
        </p>
      )}
      {(current || teams.length > 0) && <p className="text-xs text-loam-500">{t('teams.map.plan')}</p>}
    </section>
  )
}
