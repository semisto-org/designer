import { Head, Link } from '@inertiajs/react'
import { MapPinned, Plus } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { formatArea, t } from '@/lib/i18n'
import type { MapData } from '@/types'

export default function MapsIndex({ maps, canCreate }: { maps: MapData[]; canCreate: boolean }) {
  return (
    <div>
      <Head title={t('maps.index.title')} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">{t('maps.index.title')}</h1>
        {canCreate ? (
          <ButtonLink href="/maps/new"><Plus className="h-4 w-4" />{t('maps.index.new')}</ButtonLink>
        ) : (
          <ButtonLink href="/billing" variant="secondary">{t('maps.index.upgrade')}</ButtonLink>
        )}
      </div>
      {maps.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={t('maps.index.empty_title')}
            action={<ButtonLink href="/maps/new"><Plus className="h-4 w-4" />{t('maps.index.new')}</ButtonLink>}
          >
            {t('maps.index.empty_body')}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    <h2 className="truncate text-base">{map.name}</h2>
                    <p className="truncate text-sm text-loam-500">{map.address ?? map.region.name}</p>
                  </div>
                </div>
                <dl className="mt-4 flex gap-4 text-xs text-loam-500">
                  <div><dt className="sr-only">{t('maps.area')}</dt><dd>{formatArea(map.areaM2)}</dd></div>
                  <div><dt className="sr-only">{t('maps.stage')}</dt><dd>{t(`maps.stages.${map.stage}`)}</dd></div>
                  <div><dt className="sr-only">{t('maps.role')}</dt><dd>{t(`maps.roles.${map.role}`)}</dd></div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
