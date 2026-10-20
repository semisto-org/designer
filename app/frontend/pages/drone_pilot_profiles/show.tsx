import { Head, router, useForm, usePage } from '@inertiajs/react'
import { CircleAlert, Clock, CreditCard, Plus, Trash2 } from 'lucide-react'
import { useEffect, type FormEvent, type ReactNode } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { IconButton } from '@/components/ui/IconButton'
import { Pill } from '@/components/ui/Pill'
import { ToggleChip } from '@/drone_pilots/catalog'
import { t } from '@/lib/i18n'
import { formatPrice } from '@/lib/money'
import { AddressSearch } from '@/map/data/AddressSearch'
import type { DroneDataType } from '@/types/drone_pilots'

type Drone = { model: string; name?: string | null }
type Profile = {
  id: number
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  reviewNote: string | null
  listed: boolean
  displayName: string
  bio: string | null
  basePlace: string
  lng: number | null
  lat: number | null
  serviceRadiusKm: number
  missionPriceCents: number
  travelFeesEnabled: boolean
  drones: Drone[]
  dataTypes: DroneDataType[]
  certificates: string[]
  operatorNumber: string
  insurer: string
  phone: string | null
  legalForm: 'individual' | 'company'
  legalName: string
  businessNumber: string | null
  vatNumber: string | null
  chargesVat: boolean
  taxNumber: string | null
  address: string
  country: string
  birthDate: string | null
  stripeConnected: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  missions: { waiting: number; open: number }
}
type Props = {
  pilot: Profile | null
  catalogue: {
    drones: Record<string, string[]>
    dataTypes: DroneDataType[]
    photogrammetry: DroneDataType[]
    certificates: string[]
    legalForms: string[]
    countries: string[]
  }
  defaults: { displayName: string; legalName: string | null }
  commissionPercent: number
  /** VAT a pilot who charges it applies, and VAT Semisto adds to its commission, by country. */
  vatRates: Record<string, number>
  commissionVatRates: Record<string, number>
  travelCentsPerKm: number
  paymentsOpen: boolean
}

/** Mirrors DroneCatalog.possible_data_types: what a fleet can bring back. */
function possibleTypes(drones: Drone[], catalogue: Props['catalogue']): DroneDataType[] {
  const models = drones.map((d) => d.model).filter(Boolean)
  if (models.includes('other')) return catalogue.dataTypes
  if (models.length === 0) return []
  const features = new Set(models.flatMap((m) => catalogue.drones[m] ?? []))
  return catalogue.dataTypes.filter((type) =>
    catalogue.photogrammetry.includes(type) || (type === 'thermal' && features.has('thermal')) || (type === 'multispectral' && features.has('multispectral')))
}

/**
 * « Mon profil de pilote »: the application to the directory, then the
 * profile clients see (fleet, price, area) and the private details Semisto
 * needs to pay the pilot and declare it.
 */
export default function PilotProfile({ pilot, catalogue, defaults, commissionPercent, vatRates, commissionVatRates, travelCentsPerKm, paymentsOpen }: Props) {
  const { errors } = usePage().props as unknown as { errors: Record<string, string> }
  const form = useForm({
    display_name: pilot?.displayName ?? defaults.displayName,
    bio: pilot?.bio ?? '',
    base_place: pilot?.basePlace ?? '',
    lng: pilot?.lng != null ? String(pilot.lng) : '',
    lat: pilot?.lat != null ? String(pilot.lat) : '',
    service_radius_km: String(pilot?.serviceRadiusKm ?? 50),
    mission_price: pilot ? String(pilot.missionPriceCents / 100) : '',
    travel_fees_enabled: pilot?.travelFeesEnabled ?? false,
    drones: (pilot?.drones.length ? pilot.drones : [{ model: 'mini', name: '' }]) as Drone[],
    data_types: pilot?.dataTypes ?? (['photos', 'orthophoto'] as DroneDataType[]),
    certificates: pilot?.certificates ?? [],
    operator_number: pilot?.operatorNumber ?? '',
    insurer: pilot?.insurer ?? '',
    phone: pilot?.phone ?? '',
    legal_form: pilot?.legalForm ?? 'company',
    legal_name: pilot?.legalName ?? defaults.legalName ?? '',
    business_number: pilot?.businessNumber ?? '',
    vat_number: pilot?.vatNumber ?? '',
    charges_vat: pilot?.chargesVat ?? false,
    tax_number: pilot?.taxNumber ?? '',
    address: pilot?.address ?? '',
    country: pilot?.country ?? 'BE',
    birth_date: pilot?.birthDate ?? '',
    resubmit: '',
  })
  useEffect(() => form.setError(errors as never), [errors]) // eslint-disable-line react-hooks/exhaustive-deps
  const possible = possibleTypes(form.data.drones, catalogue)
  const err = (key: string) => form.errors[key as keyof typeof form.errors]

  const submit = (event: FormEvent, resubmit = false) => {
    event.preventDefault()
    form.transform((data) => ({ drone_pilot: { ...data, data_types: data.data_types.filter((d) => possible.includes(d)), resubmit: resubmit ? '1' : '' } }))
    if (pilot) form.patch('/mon-profil-pilote', { preserveScroll: true })
    else form.post('/mon-profil-pilote', { preserveScroll: true })
  }
  const setDrone = (index: number, patch: Partial<Drone>) =>
    form.setData('drones', form.data.drones.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  const toggle = <K extends 'data_types' | 'certificates'>(key: K, value: string) => {
    const list = form.data[key] as string[]
    form.setData(key, (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]) as never)
  }
  const price = Number(form.data.mission_price.replace(',', '.'))
  // Mirrors DroneMission::Quote.commission_for, so the pilot sees their share while typing.
  const priceCents = Math.round(price * 100)
  const commissionCents = Math.round((priceCents / (1 + (form.data.charges_vat ? vatRates[form.data.country] ?? 0 : 0))) * (commissionPercent / 100))
  const commissionVatCents = Math.round(commissionCents * (commissionVatRates[form.data.country] ?? 0))
  const semistoCents = commissionCents + commissionVatCents

  return (
    <div className="mx-auto max-w-3xl">
      <Head title={t('drone_pilots.profile.title')} />
      <h1 className="text-3xl">{t('drone_pilots.profile.title')}</h1>
      <p className="mt-2 text-pretty text-loam-600">{t(pilot ? 'drone_pilots.profile.intro_pilot' : 'drone_pilots.profile.intro')}</p>

      {pilot && <StatusCard pilot={pilot} paymentsOpen={paymentsOpen} />}

      <form onSubmit={(e) => submit(e)} className="mt-6 space-y-6">
        <Section title={t('drone_pilots.profile.public')} lead={t('drone_pilots.profile.public_lead')}>
          <Field label={t('drone_pilots.profile.display_name')} error={err('display_name')}>
            <Input required maxLength={80} value={form.data.display_name} onChange={(e) => form.setData('display_name', e.target.value)} />
          </Field>
          <Field label={t('drone_pilots.profile.bio')} hint={t('drone_pilots.profile.bio_hint')} error={err('bio')}>
            <Textarea rows={4} maxLength={2000} value={form.data.bio} onChange={(e) => form.setData('bio', e.target.value)} />
          </Field>
          <div className="space-y-1">
            <AddressSearch
              label={t('drone_pilots.profile.base')}
              placeholder={t('drone_pilots.profile.base_placeholder')}
              initialQuery={form.data.base_place}
              onSelect={(r) => form.setData({ ...form.data, base_place: r.label, lng: String(r.lng), lat: String(r.lat) })}
            />
            <p className="text-sm text-loam-600">
              {form.data.base_place ? t('drone_pilots.profile.base_chosen', { place: form.data.base_place }) : t('drone_pilots.profile.base_hint')}
            </p>
            {(err('base_location') || err('base_place')) && <p className="text-sm text-clay-600">{err('base_location') ?? err('base_place')}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('drone_pilots.profile.radius')} error={err('service_radius_km')}>
              <Input type="number" min={5} max={1000} required value={form.data.service_radius_km} onChange={(e) => form.setData('service_radius_km', e.target.value)} />
            </Field>
            <Field label={t('drone_pilots.profile.price')} hint={t('drone_pilots.profile.price_hint')} error={err('mission_price_cents')}>
              <Input inputMode="decimal" required value={form.data.mission_price} onChange={(e) => form.setData('mission_price', e.target.value)} />
            </Field>
          </div>
          {price > 0 && (
            <p className="text-sm text-loam-600">
              {t(commissionVatCents > 0 ? 'drone_pilots.profile.share_vat' : 'drone_pilots.profile.share', {
                percent: commissionPercent, semisto: formatPrice(semistoCents), pilot: formatPrice(priceCents - semistoCents), price: formatPrice(priceCents),
              })}
            </p>
          )}
          <label className="flex items-start gap-3 rounded-xl bg-loam-50 px-4 py-3">
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-loam-300 text-prune-600" checked={form.data.travel_fees_enabled}
              onChange={(e) => form.setData('travel_fees_enabled', e.target.checked)} />
            <span>
              <span className="block font-medium text-loam-900">{t('drone_pilots.profile.travel', { price: formatPrice(travelCentsPerKm) })}</span>
              <span className="block text-sm text-loam-600">{t('drone_pilots.profile.travel_hint')}</span>
            </span>
          </label>
        </Section>

        <Section title={t('drone_pilots.profile.equipment')} lead={t('drone_pilots.profile.equipment_lead')}>
          <div className="space-y-2">
            {form.data.drones.map((drone, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Select className="min-w-0 flex-1" value={drone.model} onChange={(e) => setDrone(index, { model: e.target.value })} aria-label={t('drone_pilots.profile.drone')}>
                  {Object.keys(catalogue.drones).map((model) => <option key={model} value={model}>{t(`drone_pilots.drones.${model}`)}</option>)}
                </Select>
                {drone.model === 'other' && (
                  <Input className="min-w-0 flex-1" placeholder={t('drone_pilots.profile.drone_other')} value={drone.name ?? ''} onChange={(e) => setDrone(index, { name: e.target.value })} />
                )}
                {form.data.drones.length > 1 && (
                  <IconButton label={t('drone_pilots.profile.remove_drone')} onClick={() => form.setData('drones', form.data.drones.filter((_, i) => i !== index))}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
            ))}
            {err('drones') && <p className="text-sm text-clay-600">{err('drones')}</p>}
            <Button variant="ghost" size="sm" onClick={() => form.setData('drones', [...form.data.drones, { model: 'mini', name: '' }])}>
              <Plus className="h-4 w-4" />{t('drone_pilots.profile.add_drone')}
            </Button>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-loam-700">{t('drone_pilots.profile.data_types')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {catalogue.dataTypes.map((type) => (
                <ToggleChip key={type} disabled={!possible.includes(type)} checked={form.data.data_types.includes(type) && possible.includes(type)} onChange={() => toggle('data_types', type)}>
                  {t(`drone_pilots.data_types.${type}.name`)}
                </ToggleChip>
              ))}
            </div>
            <p className="mt-1 text-sm text-loam-500">{t('drone_pilots.profile.data_types_hint')}</p>
            {err('data_types') && <p className="text-sm text-clay-600">{err('data_types')}</p>}
          </fieldset>
        </Section>

        <Section title={t('drone_pilots.profile.rules')} lead={t('drone_pilots.profile.rules_lead')}>
          <fieldset>
            <legend className="text-sm font-medium text-loam-700">{t('drone_pilots.profile.certificates')}</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {catalogue.certificates.map((c) => (
                <ToggleChip key={c} checked={form.data.certificates.includes(c)} onChange={() => toggle('certificates', c)}>{t(`drone_pilots.certificates.${c}`)}</ToggleChip>
              ))}
            </div>
            {err('certificates') && <p className="text-sm text-clay-600">{err('certificates')}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('drone_pilots.profile.operator_number')} hint={t('drone_pilots.profile.operator_hint')} error={err('operator_number')}>
              <Input required value={form.data.operator_number} onChange={(e) => form.setData('operator_number', e.target.value)} />
            </Field>
            <Field label={t('drone_pilots.profile.insurer')} hint={t('drone_pilots.profile.insurer_hint')} error={err('insurer')}>
              <Input required value={form.data.insurer} onChange={(e) => form.setData('insurer', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title={t('drone_pilots.profile.legal')} lead={t('drone_pilots.profile.legal_lead')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('drone_pilots.profile.legal_name')} error={err('legal_name')}>
              <Input required value={form.data.legal_name} onChange={(e) => form.setData('legal_name', e.target.value)} />
            </Field>
            <Field label={t('drone_pilots.profile.business_number')} hint={t('drone_pilots.profile.business_hint')} error={err('business_number')}>
              <Input required value={form.data.business_number} onChange={(e) => form.setData('business_number', e.target.value)} />
            </Field>
            <Field label={t('drone_pilots.profile.vat_number')} hint={t('drone_pilots.profile.vat_hint')} error={err('vat_number')}>
              <Input value={form.data.vat_number} onChange={(e) => form.setData('vat_number', e.target.value)} />
            </Field>
            <Field label={t('drone_pilots.profile.country')} error={err('country')}>
              <Select value={form.data.country} onChange={(e) => form.setData('country', e.target.value)}>
                {catalogue.countries.map((c) => <option key={c} value={c}>{t(`drone_pilots.countries.${c}`)}</option>)}
              </Select>
            </Field>
            <label className="flex items-start gap-3 rounded-xl bg-loam-50 px-4 py-3 sm:col-span-2">
              <input type="checkbox" className="mt-1 h-4 w-4 rounded border-loam-300 text-prune-600" checked={form.data.charges_vat}
                onChange={(e) => form.setData('charges_vat', e.target.checked)} />
              <span>
                <span className="block font-medium text-loam-900">{t('drone_pilots.profile.charges_vat')}</span>
                <span className="block text-sm text-loam-600">{t('drone_pilots.profile.charges_vat_hint')}</span>
              </span>
            </label>
            <Field label={t('drone_pilots.profile.phone')} hint={t('drone_pilots.profile.phone_hint')} error={err('phone')}>
              <Input type="tel" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} />
            </Field>
          </div>
          <Field label={t('drone_pilots.profile.address')} error={err('address')}>
            <Textarea rows={3} required value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} />
          </Field>
        </Section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {pilot?.status === 'rejected' && (
            <Button variant="secondary" disabled={form.processing} onClick={(e) => submit(e, true)}>{t('drone_pilots.profile.resubmit')}</Button>
          )}
          <Button type="submit" disabled={form.processing}>{pilot ? t('drone_pilots.profile.save') : t('drone_pilots.profile.apply')}</Button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10 sm:p-6">
      <div>
        <h2 className="text-xl">{title}</h2>
        <p className="mt-1 text-pretty text-sm text-loam-600">{lead}</p>
      </div>
      {children}
    </section>
  )
}

/** Where the application stands, and the next step: being paid through Stripe. */
function StatusCard({ pilot, paymentsOpen }: { pilot: Profile; paymentsOpen: boolean }) {
  const openStripe = () => router.post('/mon-profil-pilote/stripe')
  return (
    <section className="mt-5 space-y-3 rounded-2xl bg-prune-50/70 p-5 ring-1 ring-prune-100">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={{ pending: 'humus', approved: 'leaf', rejected: 'clay', suspended: 'clay' }[pilot.status] as 'humus'} icon={pilot.status === 'pending' ? <Clock /> : undefined}>
          {t(`drone_pilots.statuses.${pilot.status}`)}
        </Pill>
        {pilot.listed && <Pill tone="leaf">{t('drone_pilots.profile.listed')}</Pill>}
      </div>
      <p className="text-pretty text-sm text-loam-800">{t(`drone_pilots.profile.status_${pilot.status}`)}</p>
      {pilot.reviewNote && (
        <p className="flex gap-1.5 text-sm text-clay-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{pilot.reviewNote}</p>
      )}
      {pilot.status === 'approved' && paymentsOpen && (
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-prune-200 pt-3">
          <Button size="sm" variant={pilot.payoutsEnabled ? 'secondary' : 'primary'} onClick={openStripe}>
            <CreditCard className="h-4 w-4" />
            {pilot.payoutsEnabled ? t('drone_pilots.profile.stripe_dashboard') : t('drone_pilots.profile.stripe_setup')}
          </Button>
          <span className="text-sm text-loam-600">{pilot.payoutsEnabled ? t('drone_pilots.profile.stripe_ok') : t('drone_pilots.profile.stripe_why')}</span>
        </div>
      )}
      {(pilot.missions.open > 0 || pilot.listed) && (
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/missions-drone" size="sm" variant="ghost">
            {t('drone_pilots.profile.missions', { count: pilot.missions.open })}
          </ButtonLink>
          {pilot.missions.waiting > 0 && <HandNote arrow="left">{t('drone_pilots.profile.waiting', { count: pilot.missions.waiting })}</HandNote>}
        </div>
      )}
    </section>
  )
}
