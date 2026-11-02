import { Head } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/Button'
import { HandNote } from '@/components/ui/HandNote'
import { PlaceSketch } from '@/components/ui/PlaceSketch'
import { WelcomeAbilities, WelcomeTime, invitedLine } from '@/collab/welcome/WelcomeParts'
import PublicLayout from '@/layouts/PublicLayout'
import { t } from '@/lib/i18n'
import type { InvitationWelcome } from '@/types/collab'
import type { SketchGeometry } from '@/types/myMaps'

/**
 * The link of an invitation or of the share link, opened signed out: the
 * place itself first (its outline in watercolour, who invites, what the
 * person will do there, since when the garden grows), then signing in.
 */
export default function InvitationWelcomePage({ invitation, signInPath }: { invitation: InvitationWelcome; signInPath: string }) {
  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-4 py-10 md:grid-cols-[1fr_1.1fr] md:items-center md:py-16">
      <Head title={t('collab.joining.welcome.page_title', { map: invitation.mapName })} />
      <div className="relative">
        <PlaceSketch
          id={invitation.mapId}
          name={invitation.mapName}
          boundary={invitation.boundary as SketchGeometry | null}
          areaM2={invitation.areaM2}
        />
        <HandNote arrow="left" className="absolute -bottom-4 right-2 bg-loam-50/80 px-1">{t('collab.joining.welcome.note')}</HandNote>
      </div>
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-prune-600">{t('collab.joining.welcome.kicker')}</p>
          <h1 className="mt-1 text-3xl md:text-4xl">{t('collab.joining.welcome.title', { map: invitation.mapName })}</h1>
          <p className="mt-3 text-lg text-loam-700">{invitedLine(invitation)}</p>
        </div>
        <WelcomeTime welcome={invitation} />
        <WelcomeAbilities welcome={invitation} />
        <div>
          <ButtonLink href={signInPath} size="lg">
            {t('collab.joining.welcome.join')}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
          <p className="mt-2 text-sm text-loam-500">{t('collab.joining.welcome.join_hint')}</p>
        </div>
      </div>
    </div>
  )
}

InvitationWelcomePage.layout = (page: ReactNode) => <PublicLayout>{page}</PublicLayout>
