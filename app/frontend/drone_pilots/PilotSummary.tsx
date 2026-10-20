import { BadgeCheck, MapPin } from 'lucide-react'
import { Avatar } from '@/collab/Avatar'
import { Pill } from '@/components/ui/Pill'
import { droneName } from '@/drone_pilots/catalog'
import { t } from '@/lib/i18n'
import { formatPrice } from '@/lib/money'
import type { PilotCard } from '@/types/drone_pilots'

/** A pilot at a glance: who, where from, what they fly and bring back, and the price for my map. */
export function PilotSummary({ pilot, mapName }: { pilot: PilotCard; mapName: string | null }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Avatar name={pilot.name} url={pilot.avatarUrl} className="h-14 w-14 shrink-0 text-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-serif text-xl font-semibold text-prune-800">{pilot.name}</h2>
          <span className="flex items-center gap-1 text-sm text-loam-600">
            <MapPin className="h-4 w-4" aria-hidden />
            {pilot.basePlace}
            {pilot.distanceKm != null && mapName && <> · {t('drone_pilots.card.distance', { km: pilot.distanceKm, map: mapName })}</>}
          </span>
        </div>
        <p className="text-sm text-loam-700">{pilot.drones.map(droneName).join(' · ')}</p>
        <div className="flex flex-wrap gap-1.5">
          {pilot.dataTypes.map((type) => <Pill key={type} tone="lichen">{t(`drone_pilots.data_types.${type}.name`)}</Pill>)}
          {pilot.features.filter((f) => f === 'rtk' || f === 'lidar').map((f) => <Pill key={f} tone="prune">{t(`drone_pilots.features.${f}.name`)}</Pill>)}
        </div>
        {pilot.missionsDone > 0 && (
          <p className="flex items-center gap-1 text-sm text-leaf-700"><BadgeCheck className="h-4 w-4" aria-hidden />{t('drone_pilots.card.missions_done', { count: pilot.missionsDone })}</p>
        )}
      </div>
      <div className="shrink-0 text-left sm:text-right">
        {pilot.quote ? (
          <>
            <p className="text-2xl font-semibold tracking-tight text-loam-900">{formatPrice(pilot.quote.totalCents)}</p>
            <p className="text-sm text-loam-500">
              {pilot.quote.travelCents > 0
                ? t('drone_pilots.card.with_travel', { km: pilot.quote.travelKm })
                : t('drone_pilots.card.no_travel')}
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl font-semibold tracking-tight text-loam-900">{formatPrice(pilot.priceCents)}</p>
            <p className="text-sm text-loam-500">{pilot.travelFeesEnabled ? t('drone_pilots.card.plus_travel') : t('drone_pilots.card.no_travel')}</p>
          </>
        )}
        {pilot.sameCountry === false ? (
          <Pill tone="humus" className="mt-1.5">{t('drone_pilots.card.other_country', { country: t(`drone_pilots.countries.${pilot.country}`) })}</Pill>
        ) : pilot.serves === false && <Pill tone="humus" className="mt-1.5">{t('drone_pilots.card.out_of_range', { km: pilot.radiusKm })}</Pill>}
      </div>
    </div>
  )
}
