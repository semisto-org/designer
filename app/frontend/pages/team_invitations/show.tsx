import { Head } from '@inertiajs/react'
import { UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/Button'
import PublicLayout from '@/layouts/PublicLayout'
import { t } from '@/lib/i18n'

type State = 'invalid' | 'used' | 'expired'

/** A team invitation link that cannot be used (the working case redirects to the team). */
export default function TeamInvitationProblem({ state, teamName }: { state: State; teamName: string | null }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Head title={t(`teams.joining.problems.${state}.title`)} />
      <UsersRound className="mx-auto h-10 w-10 text-loam-400" aria-hidden="true" />
      <h1 className="mt-4 text-2xl">{t(`teams.joining.problems.${state}.title`)}</h1>
      <p className="mt-3 text-loam-600">{t(`teams.joining.problems.${state}.body`, { team: teamName ?? '' })}</p>
      <div className="mt-8">
        <ButtonLink href="/maps" variant="secondary">{t('teams.joining.my_maps')}</ButtonLink>
      </div>
    </div>
  )
}

TeamInvitationProblem.layout = (page: ReactNode) => <PublicLayout>{page}</PublicLayout>
