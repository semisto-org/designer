import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { MapPin, Plane, Snowflake, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ButtonLink } from '@/components/ui/Button'
import { CompanionEmpty } from '@/components/ui/Companion'
import { Field, Select } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { PilotSummary } from '@/drone_pilots/PilotSummary'
import { DATA_TYPES, FEATURES, ToggleChip } from '@/drone_pilots/catalog'
import { t } from '@/lib/i18n'
import type { BookableMap, DroneDataType, DroneFeature, PilotCard } from '@/types/drone_pilots'

type Props = {
  pilots: PilotCard[]
  maps: BookableMap[]
  mapId: number | null
  myPilot: { id: number; status: string; listed: boolean } | null
  bookingOpen: boolean
}

type Sort = 'distance' | 'price'

/**
 * « Pilotes de drone »: choose who will fly over my place. With a map
 * chosen, pilots who fly there come first, nearest (or cheapest) first,
 * each with the full price for that map.
 */
export default function DronePilots({ pilots, maps, mapId, myPilot, bookingOpen }: Props) {
  const [types, setTypes] = useState<DroneDataType[]>([])
  const [features, setFeatures] = useState<DroneFeature[]>([])
  const [sort, setSort] = useState<Sort>('distance')
  const map = maps.find((m) => m.id === mapId) ?? null

  const shown = useMemo(() => {
    const matching = pilots.filter((p) => types.every((type) => p.dataTypes.includes(type)) && features.every((f) => p.features.includes(f)))
    const price = (p: PilotCard) => p.quote?.totalCents ?? p.priceCents
    return [...matching].sort((a, b) => {
      if (map && a.serves !== b.serves) return a.serves ? -1 : 1
      if (sort === 'price') return price(a) - price(b)
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name)
    })
  }, [pilots, types, features, sort, map])

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  const chooseMap = (id: string) => router.get('/pilotes-drone', id ? { map_id: id } : {}, { preserveState: true, preserveScroll: true, replace: true })

  return (
    <div className="mx-auto max-w-5xl">
      <Head title={t('drone_pilots.directory.title')} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl">{t('drone_pilots.directory.title')}</h1>
          <p className="mt-2 text-pretty text-loam-600">{t('drone_pilots.directory.intro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/missions-drone" variant="ghost" size="sm">{t('drone_missions.nav')}</ButtonLink>
          <ButtonLink href="/mon-profil-pilote" variant="secondary" size="sm">
            <Plane className="h-4 w-4" aria-hidden />
            {myPilot ? t('drone_pilots.directory.my_profile') : t('drone_pilots.directory.become_pilot')}
          </ButtonLink>
        </div>
      </div>

      <Seasons />

      <section className="mt-6 grid gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5 md:grid-cols-[minmax(0,16rem)_1fr]">
        <Field label={t('drone_pilots.directory.for_map')} hint={maps.length === 0 ? t('drone_pilots.directory.no_map') : undefined}>
          <Select value={mapId ?? ''} onChange={(e) => chooseMap(e.target.value)} disabled={maps.length === 0}>
            <option value="">{t('drone_pilots.directory.any_map')}</option>
            {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <div className="space-y-3">
          <fieldset>
            <legend className="text-sm font-medium text-loam-700">{t('drone_pilots.directory.need')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DATA_TYPES.map((type) => (
                <ToggleChip key={type} checked={types.includes(type)} onChange={() => setTypes(toggle(types, type))}>
                  {t(`drone_pilots.data_types.${type}.name`)}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <fieldset>
              <legend className="text-sm font-medium text-loam-700">{t('drone_pilots.directory.equipment')}</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {FEATURES.map((feature) => (
                  <ToggleChip key={feature} checked={features.includes(feature)} onChange={() => setFeatures(toggle(features, feature))}>
                    {t(`drone_pilots.features.${feature}.name`)}
                  </ToggleChip>
                ))}
              </div>
            </fieldset>
            <Field label={t('drone_pilots.directory.sort')} className="w-44">
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="distance">{t('drone_pilots.directory.sort_distance')}</option>
                <option value="price">{t('drone_pilots.directory.sort_price')}</option>
              </Select>
            </Field>
          </div>
        </div>
      </section>

      {!bookingOpen && pilots.length > 0 && <p className="mt-4 rounded-xl bg-humus-50 px-4 py-3 text-sm text-humus-900">{t('drone_pilots.directory.booking_closed')}</p>}

      <div className="mt-6 space-y-3">
        {shown.length === 0 ? (
          <CompanionEmpty
            title={pilots.length === 0 ? t('drone_pilots.directory.empty_title') : t('drone_pilots.directory.no_match_title')}
            why={pilots.length === 0 ? t('drone_pilots.directory.empty_why') : t('drone_pilots.directory.no_match_why')}
            note={pilots.length === 0 ? t('drone_pilots.directory.empty_note') : undefined}
            action={!myPilot && <ButtonLink href="/mon-profil-pilote" variant="secondary">{t('drone_pilots.directory.become_pilot')}</ButtonLink>}
          />
        ) : (
          shown.map((pilot) => (
            <Link
              key={pilot.id}
              href={`/pilotes-drone/${pilot.id}${mapId ? `?map_id=${mapId}` : ''}`}
              className={clsx('block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 transition hover:ring-prune-300 sm:p-5', map && pilot.serves === false && 'opacity-70')}
            >
              <PilotSummary pilot={pilot} mapName={map?.name ?? null} />
            </Link>
          ))
        )}
      </div>
      {map && shown.some((p) => p.serves === false) && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-loam-500"><MapPin className="h-4 w-4" aria-hidden />{t('drone_pilots.directory.out_of_range_note')}</p>
      )}
    </div>
  )
}

/** When to fly: what each season shows of a place. */
function Seasons() {
  return (
    <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label={t('drone_pilots.seasons.title')}>
      <div className="rounded-2xl bg-lichen-50 p-4 ring-1 ring-lichen-100">
        <p className="flex items-center gap-1.5 font-medium text-loam-900"><Snowflake className="h-4 w-4 text-lichen-700" aria-hidden />{t('drone_pilots.seasons.winter_title')}</p>
        <p className="mt-1 text-pretty text-sm text-loam-700">{t('drone_pilots.seasons.winter')}</p>
      </div>
      <div className="rounded-2xl bg-humus-50 p-4 ring-1 ring-humus-100">
        <p className="flex items-center gap-1.5 font-medium text-loam-900"><Sun className="h-4 w-4 text-humus-700" aria-hidden />{t('drone_pilots.seasons.summer_title')}</p>
        <p className="mt-1 text-pretty text-sm text-loam-700">{t('drone_pilots.seasons.summer')}</p>
      </div>
      <HandNote className="sm:col-span-2" tone="leaf">{t('drone_pilots.seasons.note')}</HandNote>
    </section>
  )
}
