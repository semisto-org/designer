import { Head, Link, useForm, usePage } from '@inertiajs/react'
import { ArrowLeft, Eye, ShieldCheck } from 'lucide-react'
import { useEffect, type FormEvent } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Pill } from '@/components/ui/Pill'
import { Breakdown } from '@/drone_pilots/Breakdown'
import { PilotSummary } from '@/drone_pilots/PilotSummary'
import { STATUS_TONES, ToggleChip, droneName } from '@/drone_pilots/catalog'
import { t } from '@/lib/i18n'
import type { BookableMap, DroneDataType, DroneQuote, MissionStatus, PilotCard } from '@/types/drone_pilots'

type MapChoice = BookableMap & { serves: boolean; distanceKm: number | null; quote: DroneQuote }
type Props = {
  pilot: PilotCard
  maps: MapChoice[]
  mapId: number | null
  own: boolean
  bookingOpen: boolean
  waiting: { id: number; status: MissionStatus; mapName: string }[]
}

/** A pilot's page: their fleet, what they bring back, and the request for a mission on one of my maps. */
export default function DronePilot({ pilot, maps, mapId, own, bookingOpen, waiting }: Props) {
  const { errors } = usePage().props as unknown as { errors: Record<string, string> }
  const form = useForm({
    drone_pilot_id: pilot.id,
    map_id: String(mapId ?? maps.find((m) => m.serves)?.id ?? ''),
    data_types: [] as DroneDataType[],
    desired_period: '',
    message: '',
  })
  const map = maps.find((m) => String(m.id) === form.data.map_id) ?? null
  // The server also names the map, the pilot and the request as a whole.
  const formErrors = form.errors as Partial<Record<keyof typeof form.data | 'map' | 'drone_pilot' | 'base', string>>
  useEffect(() => form.setError(errors as never), [errors]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: FormEvent) => {
    event.preventDefault()
    form.transform((data) => ({ drone_mission: data }))
    form.post('/missions-drone', { preserveScroll: true })
  }
  const toggleType = (type: DroneDataType) =>
    form.setData('data_types', form.data.data_types.includes(type) ? form.data.data_types.filter((d) => d !== type) : [...form.data.data_types, type])

  return (
    <div className="mx-auto max-w-4xl">
      <Head title={pilot.name} />
      <Link href={`/pilotes-drone${mapId ? `?map_id=${mapId}` : ''}`} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('drone_pilots.directory.title')}
      </Link>

      <section className="mt-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10 sm:p-6">
        <PilotSummary pilot={{ ...pilot, ...(map ? { quote: map.quote, distanceKm: map.distanceKm, serves: map.serves } : {}) }} mapName={map?.name ?? null} />
        {pilot.bio && <p className="mt-5 whitespace-pre-line text-pretty leading-relaxed text-loam-800">{pilot.bio}</p>}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="brings">
          <h2 id="brings" className="text-xl">{t('drone_pilots.show.brings')}</h2>
          <ul className="mt-3 space-y-2">
            {pilot.dataTypes.map((type) => (
              <li key={type} className="rounded-xl bg-loam-50 px-4 py-3">
                <p className="font-medium text-loam-900">{t(`drone_pilots.data_types.${type}.name`)}</p>
                <p className="mt-0.5 text-pretty text-sm text-loam-600">{t(`drone_pilots.data_types.${type}.use`)}</p>
              </li>
            ))}
          </ul>
          <h2 className="mt-6 text-xl">{t('drone_pilots.show.fleet')}</h2>
          <ul className="mt-2 list-inside list-disc text-loam-700">
            {pilot.drones.map((drone, index) => <li key={index}>{droneName(drone)}</li>)}
          </ul>
          <p className="mt-4 flex flex-wrap items-center gap-1.5 text-sm text-loam-600">
            <ShieldCheck className="h-4 w-4 text-leaf-600" aria-hidden />
            {t('drone_pilots.show.checked')}
            {pilot.certificates.map((c) => <Pill key={c} tone="leaf">{t(`drone_pilots.certificates.${c}`)}</Pill>)}
          </p>
        </section>

        <aside className="space-y-3">
          {waiting.map((mission) => (
            <Link key={mission.id} href={`/missions-drone/${mission.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-prune-50 px-4 py-3 text-sm text-prune-900 hover:bg-prune-100">
              <span>{t('drone_pilots.show.waiting', { map: mission.mapName })}</span>
              <Pill tone={STATUS_TONES[mission.status]}>{t(`drone_missions.statuses.${mission.status}`)}</Pill>
            </Link>
          ))}
          {own ? (
            <p className="rounded-2xl bg-loam-50 p-4 text-sm text-loam-700">{t('drone_pilots.show.own')}</p>
          ) : maps.length === 0 ? (
            <div className="rounded-2xl bg-loam-50 p-4 text-sm text-loam-700">
              <p>{t('drone_pilots.show.no_map')}</p>
              <ButtonLink href="/maps/new" size="sm" className="mt-3">{t('drone_pilots.show.create_map')}</ButtonLink>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10">
              <h2 className="text-xl">{t('drone_pilots.show.request_title')}</h2>
              <Field label={t('drone_pilots.show.map')} error={formErrors.map}>
                <Select value={form.data.map_id} onChange={(e) => form.setData('map_id', e.target.value)}>
                  {maps.map((m) => (
                    <option key={m.id} value={m.id}>{m.serves ? m.name : t('drone_pilots.show.map_out_of_range', { name: m.name })}</option>
                  ))}
                </Select>
              </Field>
              <fieldset>
                <legend className="text-sm font-medium text-loam-700">{t('drone_pilots.show.what')}</legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pilot.dataTypes.map((type) => (
                    <ToggleChip key={type} checked={form.data.data_types.includes(type)} onChange={() => toggleType(type)}>
                      {t(`drone_pilots.data_types.${type}.name`)}
                    </ToggleChip>
                  ))}
                </div>
                {form.errors.data_types && <p className="mt-1 text-sm text-clay-600">{form.errors.data_types}</p>}
              </fieldset>
              <Field label={t('drone_pilots.show.period')} hint={t('drone_pilots.show.period_hint')} error={form.errors.desired_period}>
                <Input value={form.data.desired_period} maxLength={120} onChange={(e) => form.setData('desired_period', e.target.value)} />
              </Field>
              <Field label={t('drone_pilots.show.message')} error={form.errors.message}>
                <Textarea rows={4} maxLength={3000} required value={form.data.message} placeholder={t('drone_pilots.show.message_placeholder')}
                  onChange={(e) => form.setData('message', e.target.value)} />
              </Field>
              {map && <Breakdown quote={map.quote} />}
              {formErrors.base && <p className="text-sm text-clay-600">{formErrors.base}</p>}
              {formErrors.drone_pilot && <p className="text-sm text-clay-600">{formErrors.drone_pilot}</p>}
              <Button type="submit" className="w-full" disabled={form.processing || !map?.serves || form.data.data_types.length === 0}>
                {t('drone_pilots.show.send')}
              </Button>
              <p className="flex gap-1.5 text-sm text-loam-500"><Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t('drone_pilots.show.privacy')}</p>
              {!bookingOpen && <p className="text-sm text-humus-800">{t('drone_pilots.directory.booking_closed')}</p>}
            </form>
          )}
        </aside>
      </div>
    </div>
  )
}
