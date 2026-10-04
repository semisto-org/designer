import { usePage } from '@inertiajs/react'
import { UsersRound } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { t } from '@/lib/i18n'
import type { TeamAwareUser } from '@/types/teams'

/** "Équipes" card of the account page: where to find or create a team. */
export function TeamsCard() {
  const { currentUser } = usePage().props as unknown as { currentUser: TeamAwareUser | null }
  const count = currentUser?.teamsCount ?? 0
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-xl flex-1">
          <h2 className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4 text-prune-500" aria-hidden="true" />{t('teams.account.title')}</h2>
          <p className="mt-2 text-sm text-loam-600">{count > 0 ? t('teams.account.body', { count }) : t('teams.account.body_none')}</p>
        </div>
        <ButtonLink href="/teams" variant="secondary">{count > 0 ? t('teams.account.link') : t('teams.account.create')}</ButtonLink>
      </div>
    </Card>
  )
}
