import { Head } from '@inertiajs/react'
import { area as turfArea, booleanPointInPolygon, point } from '@turf/turf'
import clsx from 'clsx'
import * as maplibregl from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { ArrowRight, Check, ChevronLeft, ImagePlus, Loader2, MapPin, Phone, Sprout, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { MapView } from '@/map/MapView'
import { useMapInstance } from '@/map/MapContext'
import { AddressSearch } from '@/map/data/AddressSearch'
import { hideParcelSelection, showParcelSelection } from '@/map/layers/parcels'
import { syncRegionLayers } from '@/map/layers/region'
import { FormLayout } from '@/pages/project_forms/show'
import type { LngLat, RegionData, RegionLayerData } from '@/types'
import type { GeocodeResult, ParcelData } from '@/types/map_data'
import type { AnswerField, Answers, PublicRequestFormProps } from '@/types/request_forms'

type Step = 'place' | 'project' | 'you'
const STEPS: Step[] = ['place', 'project', 'you']
type Located = { region: RegionData; layers: RegionLayerData[]; cadastre: string | null; parcels: boolean }
type Focus = { center: LngLat; zoom: number; key: number }

// The project sheet's own option labels, for the questions it shares.
const SHEET_OPTIONS: Record<string, string> = {
  profile: 'journey.project.sections.who.fields.profile.options',
  budget: 'journey.project.sections.budget.fields.initial.options',
  water: 'journey.project.sections.constraints.fields.water.options',
  access: 'journey.project.sections.constraints.fields.access.options',
  slope: 'journey.project.sections.constraints.fields.slope.options',
}
const optionLabel = (field: string, value: string) =>
  t(SHEET_OPTIONS[field] ? `${SHEET_OPTIONS[field]}.${value}` : `request_forms.public.options.${field}.${value}`)

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const PHOTO_MAX_BYTES = 15 * 1024 * 1024

/**
 * A professional's public request form (/demande/:slug): the prospect finds
 * their place and touches their parcels on the cadastre, says what they
 * want, then who they are. Three short steps, « vous » throughout; the
 * team gets the request with its outline, ready for the call and the visit.
 */
export default function PublicRequestForm({ slug, account, intro, region: baseRegion, layers: baseLayers, schema, maxPhotos, maxParcels }: PublicRequestFormProps) {
  const endpoint = `/demande/${slug}`
  const [step, setStep] = useState<Step>('place')
  const [focus, setFocus] = useState<Focus | null>(null)
  const [located, setLocated] = useState<Located | null>(null)
  const [address, setAddress] = useState('')
  const [pin, setPin] = useState<LngLat | null>(null)
  const [parcels, setParcels] = useState<(ParcelData & { lng: number; lat: number })[]>([])
  const [answers, setAnswers] = useState<Answers>({})
  const [message, setMessage] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [you, setYou] = useState({ name: '', email: '', phone: '', website: '' })
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)

  const index = STEPS.indexOf(step)
  const hectares = useMemo(() => parcels.reduce((sum, p) => sum + turfArea(p.geometry), 0) / 10_000, [parcels])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step, sent])

  async function locate(center: LngLat) {
    try {
      const data = await api<Located>(`${endpoint}/locate?lng=${center[0]}&lat=${center[1]}`)
      setLocated((current) => (current?.region.id === data.region.id ? current : data))
      return data
    } catch {
      return null
    }
  }

  function choose(result: GeocodeResult) {
    const center: LngLat = [result.lng, result.lat]
    setAddress(result.label)
    setFocus({ center, zoom: Math.max(result.zoom, 17), key: Date.now() })
    void locate(center)
  }

  async function touch(at: LngLat) {
    const place = located ?? (await locate(at))
    if (!place?.parcels) {
      setPin(at)
      return
    }
    const hit = parcels.find((p) => booleanPointInPolygon(point(at), p.geometry))
    if (hit) {
      setParcels((list) => list.filter((p) => p.capakey !== hit.capakey))
      return
    }
    if (parcels.length >= maxParcels) {
      setNotice(t('request_forms.public.place.too_many', { count: maxParcels }))
      return
    }
    setNotice(t('request_forms.public.place.loading'))
    try {
      const { parcel } = await api<{ parcel: ParcelData }>(`${endpoint}/parcel?lng=${at[0]}&lat=${at[1]}`)
      setParcels((list) => (list.some((p) => p.capakey === parcel.capakey) ? list : [...list, { ...parcel, lng: at[0], lat: at[1] }]))
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('request_forms.public.errors.send'))
    }
  }

  function toggle(field: AnswerField, value: string) {
    setAnswers((current) => {
      if (field.type === 'enum') return { ...current, [field.key]: current[field.key] === value ? '' : value }
      const list = Array.isArray(current[field.key]) ? (current[field.key] as string[]) : []
      const exclusive = field.exclusive ?? []
      let next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
      if (!list.includes(value)) next = exclusive.includes(value) ? [value] : next.filter((v) => !exclusive.includes(v))
      return { ...current, [field.key]: next }
    })
  }

  function addPhotos(files: FileList | null) {
    if (!files) return
    const accepted = Array.from(files).filter((f) => (PHOTO_TYPES.includes(f.type) || /\.(heic|heif)$/i.test(f.name)) && f.size <= PHOTO_MAX_BYTES)
    setNotice(accepted.length < files.length ? t('request_forms.public.errors.photo') : null)
    setPhotos((list) => [...list, ...accepted].slice(0, maxPhotos))
  }

  async function send() {
    const problems: Record<string, string> = {}
    if (!you.name.trim()) problems.name = t('request_forms.public.errors.name')
    if (!/^\S+@\S+\.\S+$/.test(you.email.trim())) problems.email = t('request_forms.public.errors.email')
    setErrors(problems)
    if (Object.keys(problems).length > 0) return

    setSending(true)
    setNotice(null)
    const body = new FormData()
    const cleanAnswers = Object.fromEntries(Object.entries(answers).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v)))
    body.append('payload', JSON.stringify({
      name: you.name, email: you.email, phone: you.phone, address, message, answers: cleanAnswers,
      center: pin, parcels: parcels.map(({ capakey, lng, lat, label }) => ({ capakey, lng, lat, label })),
    }))
    photos.forEach((photo) => body.append('photos[]', photo))
    if (you.website) body.append('website', you.website)
    try {
      await api(endpoint, { method: 'POST', body })
      setSent(true)
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('request_forms.public.errors.send'))
    } finally {
      setSending(false)
    }
  }

  const title = t('request_forms.public.title', { account })
  if (sent) return <Thanks account={account} email={you.email} title={title} />

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
      <Head title={title}><meta name="robots" content="noindex, nofollow" /></Head>
      <p className="text-sm font-medium text-prune-700">{account}</p>
      <h1 className="mt-1 text-3xl sm:text-4xl">{t('request_forms.public.heading')}</h1>
      <p className="mt-3 whitespace-pre-line text-loam-600">{intro?.trim() || t('request_forms.public.default_intro', { account })}</p>

      <ol className="mt-6 flex gap-2" aria-label={title}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button
              type="button"
              disabled={i > index}
              onClick={() => setStep(s)}
              className={clsx('w-full border-t-4 pt-2 text-left text-sm font-medium transition-colors',
                i <= index ? 'border-leaf-500 text-loam-900' : 'border-loam-200 text-loam-400')}
              aria-current={s === step ? 'step' : undefined}
            >
              {i + 1}. {t(`request_forms.public.steps.${s}`)}
            </button>
          </li>
        ))}
      </ol>

      <Card className="mt-6">
        {step === 'place' && (
          <div className="space-y-3">
            <AddressSearch
              endpoint={`${endpoint}/geocode`}
              regionId={located?.region.id ?? baseRegion.id}
              label={t('request_forms.public.place.address')}
              placeholder={t('request_forms.public.place.address_placeholder')}
              onSelect={choose}
            />
            <p className="text-sm text-loam-600">
              {located && !located.parcels ? t('request_forms.public.place.europe') : t('request_forms.public.place.hint')}
            </p>
            <div className="relative h-80 overflow-hidden rounded-xl ring-1 ring-loam-200 sm:h-96">
              <MapView className="absolute inset-0" center={baseRegion.center} zoom={baseRegion.defaultZoom}>
                <PlacePicker
                  located={located}
                  fallback={{ region: baseRegion, layers: baseLayers }}
                  focus={focus}
                  parcels={parcels}
                  pin={pin}
                  onTouch={touch}
                />
              </MapView>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
              <MapPin className="h-4 w-4 text-prune-600" aria-hidden />
              <span className="font-medium text-loam-800">
                {parcels.length > 0 || !pin
                  ? t('request_forms.public.place.selected', { count: parcels.length })
                  : address || `${pin[1].toFixed(5)}, ${pin[0].toFixed(5)}`}
              </span>
              {hectares > 0 && <span className="text-loam-600">{t('request_forms.public.place.area', { area: hectares.toLocaleString('fr-BE', { maximumFractionDigits: 2 }) })}</span>}
              {notice && <span className="text-loam-600">{notice}</span>}
            </div>
            {parcels.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {parcels.map((p) => (
                  <li key={p.capakey} className="inline-flex items-center gap-1 rounded-full bg-loam-100 py-1 pl-3 pr-1 text-sm text-loam-700">
                    {p.label || p.capakey}
                    <button type="button" className="rounded-full p-1 hover:bg-loam-200" aria-label={t('request_forms.public.place.remove')}
                      onClick={() => setParcels((list) => list.filter((x) => x.capakey !== p.capakey))}>
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {parcels.length === 0 && !pin && <p className="text-sm text-loam-500">{t('request_forms.public.place.skip')}</p>}
          </div>
        )}

        {step === 'project' && (
          <div className="space-y-6">
            {schema.fields.map((field) => (
              <fieldset key={field.key}>
                <legend className="font-medium text-loam-800">{t(`request_forms.public.questions.${field.key}`)}</legend>
                {field.type !== 'enum' && <p className="text-sm text-loam-500">{t('request_forms.public.several')}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {field.values.map((value) => {
                    const current = answers[field.key]
                    const on = Array.isArray(current) ? current.includes(value) : current === value
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(field, value)}
                        className={clsx('rounded-full px-3.5 py-1.5 text-sm ring-1 ring-inset transition-colors',
                          on ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-50')}
                      >
                        {on && <Check className="-ml-0.5 mr-1 inline h-3.5 w-3.5" aria-hidden />}
                        {optionLabel(field.key, value)}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            <Field label={t('request_forms.public.questions.message')}>
              <Textarea rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder={t('request_forms.public.questions.message_placeholder')} />
            </Field>
            <div>
              <p className="font-medium text-loam-800">{t('request_forms.public.questions.photos')}</p>
              <p className="text-sm text-loam-500">{t('request_forms.public.questions.photos_hint', { count: maxPhotos })}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((photo, i) => (
                  <PhotoThumb key={`${photo.name}-${i}`} file={photo} onRemove={() => setPhotos((list) => list.filter((_, j) => j !== i))} />
                ))}
                {photos.length < maxPhotos && (
                  <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-loam-300 text-loam-500 hover:border-prune-400 hover:text-prune-700">
                    <ImagePlus className="h-5 w-5" aria-hidden />
                    <span className="sr-only">{t('request_forms.public.questions.photos_add')}</span>
                    <input type="file" accept="image/*,.heic,.heif" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
                  </label>
                )}
              </div>
              {notice && <p className="mt-2 text-sm text-clay-600">{notice}</p>}
            </div>
          </div>
        )}

        {step === 'you' && (
          <div className="space-y-4">
            <Field label={t('request_forms.public.you.name')} error={errors.name}>
              <Input autoComplete="name" maxLength={120} value={you.name} onChange={(e) => setYou({ ...you, name: e.target.value })} />
            </Field>
            <Field label={t('request_forms.public.you.email')} error={errors.email}>
              <Input type="email" autoComplete="email" maxLength={200} value={you.email} onChange={(e) => setYou({ ...you, email: e.target.value })} />
            </Field>
            <Field label={t('request_forms.public.you.phone')} hint={t('request_forms.public.you.phone_hint')}>
              <Input type="tel" autoComplete="tel" maxLength={40} value={you.phone} onChange={(e) => setYou({ ...you, phone: e.target.value })} />
            </Field>
            {/* Never seen by people: a robot that fills it is ignored. */}
            <div className="absolute -left-[9999px]" aria-hidden>
              <label>Website<input tabIndex={-1} autoComplete="off" value={you.website} onChange={(e) => setYou({ ...you, website: e.target.value })} /></label>
            </div>
            <p className="text-sm text-loam-500">{t('request_forms.public.you.consent', { account })}</p>
            {notice && <p className="text-sm text-clay-600" role="alert">{notice}</p>}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-loam-100 pt-4">
          <Button variant="secondary" disabled={index === 0} onClick={() => setStep(STEPS[index - 1])}>
            <ChevronLeft className="h-4 w-4" aria-hidden />{t('request_forms.public.previous')}
          </Button>
          {step !== 'you' ? (
            <Button onClick={() => { setNotice(null); setStep(STEPS[index + 1]) }}>
              {t('request_forms.public.next')}<ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button variant="leaf" disabled={sending} onClick={send}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {sending ? t('request_forms.public.sending') : t('request_forms.public.send')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

/** After sending: what happens next, as the seasons of a project start. */
function Thanks({ account, email, title }: { account: string; email: string; title: string }) {
  const steps: { icon: ReactNode; label: string }[] = [
    { icon: <Phone className="h-4 w-4" aria-hidden />, label: t('request_forms.public.thanks.steps.call') },
    { icon: <MapPin className="h-4 w-4" aria-hidden />, label: t('request_forms.public.thanks.steps.visit') },
    { icon: <Sprout className="h-4 w-4" aria-hidden />, label: t('request_forms.public.thanks.steps.offer') },
  ]
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10">
      <Head title={title} />
      <Card>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-leaf-100 text-leaf-700"><Check className="h-6 w-6" aria-hidden /></div>
        <h1 className="mt-4 text-3xl">{t('request_forms.public.thanks.title')}</h1>
        <p className="mt-3 text-loam-700">{t('request_forms.public.thanks.body', { account, email })}</p>
        <p className="mt-4 text-loam-600">{t('request_forms.public.thanks.next')}</p>
        <ol className="mt-5 flex flex-wrap items-center gap-2 text-sm text-loam-700">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-loam-300" aria-hidden />}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-loam-100 px-3 py-1">{s.icon}{s.label}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function PhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-loam-100 ring-1 ring-loam-200">
      {url && <img src={url} alt={file.name} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
      <button type="button" onClick={onRemove} aria-label={t('request_forms.public.place.remove')}
        className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-loam-700 shadow">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

/**
 * The map of the form: the region's plan, then the aerial photo with the
 * cadastre over it once the place is found. A tap picks or drops a parcel
 * (or places the pin where there is no cadastre).
 */
function PlacePicker({ located, fallback, focus, parcels, pin, onTouch }: {
  located: Located | null
  fallback: { region: RegionData; layers: RegionLayerData[] }
  focus: Focus | null
  parcels: ParcelData[]
  pin: LngLat | null
  onTouch: (at: LngLat) => void
}) {
  const instance = useMapInstance()
  const marker = useRef<maplibregl.Marker | null>(null)
  const touch = useRef(onTouch)
  touch.current = onTouch
  const layers = located?.layers ?? fallback.layers
  const region = located?.region ?? fallback.region

  useEffect(() => {
    if (!instance) return
    const plan = layers.find((l) => l.kind === 'style') ?? layers[0]
    const photo = layers.find((l) => l.category === 'base' && l.options.default === true) ?? plan
    const base = (focus ? photo : plan)?.key ?? null
    const overlays = focus && located?.cadastre ? [located.cadastre] : []
    syncRegionLayers(instance, layers, { base, overlays, opacity: {}, bounds: region.bounds }, () => undefined)
  }, [instance, layers, region.bounds, focus, located])

  useEffect(() => {
    if (!instance || !focus) return
    instance.resize()
    instance.jumpTo({ center: focus.center, zoom: Math.min(focus.zoom, 18) })
  }, [instance, focus])

  useEffect(() => {
    if (!instance) return
    const apply = () => (parcels.length ? showParcelSelection(instance, parcels) : hideParcelSelection(instance))
    if (instance.isStyleLoaded()) apply()
    else instance.once('load', apply)
  }, [instance, parcels])

  useEffect(() => {
    if (!instance) return
    if (!pin) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (!marker.current) marker.current = new maplibregl.Marker({ color: '#5b5781' }).setLngLat(pin).addTo(instance)
    else marker.current.setLngLat(pin)
  }, [instance, pin])

  useEffect(() => {
    if (!instance) return
    const onClick = (e: MapMouseEvent) => touch.current([e.lngLat.lng, e.lngLat.lat])
    instance.on('click', onClick)
    instance.getCanvas().style.cursor = 'pointer'
    return () => {
      instance.off('click', onClick)
    }
  }, [instance])

  useEffect(() => () => {
    marker.current?.remove()
  }, [])
  return null
}

PublicRequestForm.layout = (page: ReactNode) => <FormLayout>{page}</FormLayout>
