import { Head } from '@inertiajs/react'
import { Plus } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { WelcomeCard } from '@/components/journey/WelcomeCard'
import { t } from '@/lib/i18n'
import { MapCardGrid } from '@/my_maps/MapCard'
import { ResumeCard } from '@/my_maps/ResumeCard'
import { SeasonNote } from '@/my_maps/SeasonNote'
import { TeamMapsSection, groupMapsByTeam } from '@/teams/TeamMapsSection'
import { IncomingTransfers } from '@/transfer/IncomingTransfers'
import type { Resume } from '@/types/myMaps'
import type { ListedMap } from '@/types/teams'
import type { IncomingTransfer } from '@/types/transfer'

type Props = {
  maps: ListedMap[]
  canCreate: boolean
  /** The teams I belong to: their maps get a section each. */
  teams?: { id: number; name: string }[]
  /** Maps someone proposes me to take over (transfer area). */
  incomingTransfers?: IncomingTransfer[]
  /** The map worked on last and its next step: it opens large, first. */
  resume?: Resume | null
}

// « Mes cartes » as a field notebook: the map worked on last opens as a full
// page, the others are pinned sketches of their terrain below it.
export default function MapsIndex({ maps, canCreate, teams = [], incomingTransfers = [], resume }: Props) {
  const resumed = resume ? maps.find((map) => map.id === resume.mapId) : undefined
  const { own, byTeam } = groupMapsByTeam(maps.filter((map) => map !== resumed), teams)
  const resumedIsOwn = resumed != null && !byTeam.some(({ team }) => team.id === resumed.teamId)
  return (
    <div>
      <Head title={t('maps.index.title')} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">{t('maps.index.title')}</h1>
          {maps.length > 0 && <SeasonNote />}
        </div>
        {canCreate ? (
          // The welcome card carries the call to action for a first map.
          maps.length > 0 && <ButtonLink href="/maps/new"><Plus className="h-4 w-4" />{t('maps.index.new')}</ButtonLink>
        ) : (
          <ButtonLink href="/billing" variant="secondary">{t('maps.index.upgrade')}</ButtonLink>
        )}
      </div>
      <IncomingTransfers transfers={incomingTransfers} />
      {maps.length === 0 ? (
        <div className="mt-8">
          <WelcomeCard canCreate={canCreate} />
        </div>
      ) : (
        <>
          {resumed && resume && <ResumeCard map={resumed} next={resume.next} />}
          {own.length > 0 && (
            <section className="mt-12">
              {resumed && (
                <h2 className="border-b border-loam-200 pb-2 text-2xl">
                  {t(resumedIsOwn ? 'my_maps.other_maps' : 'my_maps.own_maps')}
                </h2>
              )}
              <MapCardGrid maps={own} headingLevel={resumed ? 'h3' : 'h2'} />
            </section>
          )}
        </>
      )}
      {byTeam.map(({ team, maps: teamMaps }) => (
        <TeamMapsSection key={team.id} team={team} empty={teamMaps.length === 0 && resumed?.teamId !== team.id}>
          <MapCardGrid maps={teamMaps} showOwner headingLevel="h3" />
        </TeamMapsSection>
      ))}
    </div>
  )
}
