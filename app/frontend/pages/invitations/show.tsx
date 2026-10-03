import { Head } from '@inertiajs/react'
import { LinkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/Button'
import PublicLayout from '@/layouts/PublicLayout'
import { t } from '@/lib/i18n'

type State = 'invalid' | 'used' | 'expired' | 'disabled' | 'editor_limit'

/** A link to join a map that cannot be used (the working case redirects to the map). */
export default function InvitationProblem({ state, mapName }: { state: State; mapName: string | null }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Head title={t(`collab.joining.problems.${state}.title`)} />
      <LinkIcon className="mx-auto h-10 w-10 text-loam-400" aria-hidden="true" />
      <h1 className="mt-4 text-2xl">{t(`collab.joining.problems.${state}.title`)}</h1>
      <p className="mt-3 text-loam-600">{t(`collab.joining.problems.${state}.body`, { map: mapName ?? '' })}</p>
      <div className="mt-8">
        <ButtonLink href="/maps" variant="secondary">{t('collab.joining.my_maps')}</ButtonLink>
      </div>
    </div>
  )
}

InvitationProblem.layout = (page: ReactNode) => <PublicLayout>{page}</PublicLayout>
