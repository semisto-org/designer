import { Head, router } from '@inertiajs/react'
import { Map as MapIcon } from 'lucide-react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { confirmAction } from '@/components/ui/confirm'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'

type Row = {
  id: number
  name: string
  createdAt: string
  membersCount: number
  mapsCount: number
  /** When Semisto granted « Territoire », or null. */
  territoryModule: string | null
  territoriesActive: number
  territoriesArchived: number
}

/** « Équipes »: every team, and the « Territoire » module Semisto grants it (a team never turns it on itself). */
export default function AdminTeams({ teams }: { teams: Row[] }) {
  const set = async (team: Row, value: 'grant' | 'revoke') => {
    if (value === 'revoke') {
      const ok = await confirmAction({
        title: t('admin.teams.revoke_confirm.title', { name: team.name }),
        body: t('admin.teams.revoke_confirm.body'),
        confirmLabel: t('admin.teams.revoke'),
      })
      if (!ok) return
    }
    router.patch(`/admin/teams/${team.id}`, { territory_module: value }, { preserveScroll: true })
  }

  return (
    <div>
      <Head title={t('admin.teams.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin.teams.title')}</h1>
      <p className="mt-1 max-w-3xl text-loam-500">{t('admin.teams.intro')}</p>

      {teams.length === 0 ? (
        <div className="mt-8"><EmptyState title={t('admin.teams.empty')} /></div>
      ) : (
        <ul className="mt-8 grid gap-3">
          {teams.map((team) => (
            <li key={team.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-loam-200 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-lg font-semibold text-prune-900">{team.name}</span>
                  {team.territoryModule && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-leaf-100 px-2.5 py-0.5 text-sm font-medium text-leaf-800">
                      <MapIcon className="h-3.5 w-3.5" aria-hidden />
                      {t('admin.teams.granted_on', { date: formatDate(team.territoryModule) })}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-loam-500">
                  {[
                    t('admin.teams.members', { count: team.membersCount }),
                    t('admin.teams.maps', { count: team.mapsCount }),
                    team.territoriesActive + team.territoriesArchived > 0
                      ? t('admin.teams.territories', { count: team.territoriesActive, archived: team.territoriesArchived })
                      : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              {team.territoryModule
                ? <Button size="sm" variant="secondary" onClick={() => set(team, 'revoke')}>{t('admin.teams.revoke')}</Button>
                : <Button size="sm" onClick={() => set(team, 'grant')}>{t('admin.teams.grant')}</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
