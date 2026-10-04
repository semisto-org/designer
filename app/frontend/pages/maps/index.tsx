import { Head, Link } from '@inertiajs/react'
import { MapPinned, Plus } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { WelcomeCard } from '@/components/journey/WelcomeCard'
import { formatArea, t } from '@/lib/i18n'
import { TeamMapsSection, groupMapsByTeam } from '@/teams/TeamMapsSection'
import type { ListedMap } from '@/types/teams'

type Props = {
  maps: ListedMap[]
  canCreate: boolean
  /** The teams I belong to: their maps get a section each. */
  teams?: { id: number; name: string }[]
}

export default function MapsIndex({ maps, canCreate, teams = [] }: Props) {
  const { own, byTeam } = groupMapsByTeam(maps, teams)
  return (
    <div>
      <Head title={t('maps.index.title')} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">{t('maps.index.title')}</h1>
        {canCreate ? (
          // The welcome card carries the call to action for a first map.
          maps.length > 0 && <ButtonLink href="/maps/new"><Plus className="h-4 w-4" />{t('maps.index.new')}</ButtonLink>
        ) : (
          <ButtonLink href="/billing" variant="secondary">{t('maps.index.upgrade')}</ButtonLink>
        )}
      </div>
      {maps.length === 0 ? (
        <div className="mt-8">
          <WelcomeCard canCreate={canCreate} />
        </div>
      ) : (
        own.length > 0 && <MapGrid maps={own} />
      )}
      {byTeam.map(({ team, maps: teamMaps }) => (
        <TeamMapsSection key={team.id} team={team} empty={teamMaps.length === 0}>
          <MapGrid maps={teamMaps} showOwner />
        </TeamMapsSection>
      ))}
    </div>
  )
}

// Team maps sit under the team's heading (h2), so their titles are h3.
function MapGrid({ maps, showOwner = false }: { maps: ListedMap[]; showOwner?: boolean }) {
  if (maps.length === 0) return null
  const Title = showOwner ? 'h3' : 'h2'
  return (
    <ul className={showOwner ? 'mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'}>
      {maps.map((map) => (
        <li key={map.id}>
          <Link
            href={`/maps/${map.id}`}
            className="block rounded-xl bg-white p-5 shadow-sm ring-1 ring-loam-200/70 transition hover:ring-prune-300"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-600">
                <MapPinned className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <Title className="truncate text-base">{map.name}</Title>
                <p className="truncate text-sm text-loam-500">{map.address ?? map.region.name}</p>
              </div>
            </div>
            <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-loam-500">
              <div><dt className="sr-only">{t('maps.area')}</dt><dd>{formatArea(map.areaM2)}</dd></div>
              <div><dt className="sr-only">{t('maps.stage')}</dt><dd>{t(`maps.stages.${map.stage}`)}</dd></div>
              <div><dt className="sr-only">{t('maps.role')}</dt><dd>{t(`maps.roles.${map.role}`)}</dd></div>
              {showOwner && map.role !== 'owner' && (
                <div className="min-w-0"><dt className="sr-only">{t('maps.roles.owner')}</dt><dd className="truncate">{t('teams.maps_index.owner', { name: map.ownerName })}</dd></div>
              )}
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  )
}
