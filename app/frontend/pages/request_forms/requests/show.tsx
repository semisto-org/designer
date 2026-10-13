import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import * as maplibregl from 'maplibre-gl'
import { ArrowLeft, Calculator, Check, Mail, Map as MapIcon, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import { MapView } from '@/map/MapView'
import { useMapInstance } from '@/map/MapContext'
import { syncRegionLayers } from '@/map/layers/region'
import { STATUS_TONE } from '@/pages/request_forms/index'
import type { RegionLayerData } from '@/types'
import type { AnswersSchema, RequestDetail, RequestStatus } from '@/types/request_forms'

const SHEET_OPTIONS: Record<string, string> = {
  profile: 'journey.project.sections.who.fields.profile.options',
  budget: 'journey.project.sections.budget.fields.initial.options',
  water: 'journey.project.sections.constraints.fields.water.options',
  access: 'journey.project.sections.constraints.fields.access.options',
  slope: 'journey.project.sections.constraints.fields.slope.options',
}
const optionLabel = (field: string, value: string) =>
  t(SHEET_OPTIONS[field] ? `${SHEET_OPTIONS[field]}.${value}` : `request_forms.public.options.${field}.${value}`)

type Props = { request: RequestDetail; account: string; schema: AnswersSchema; statuses: RequestStatus[]; layers: RegionLayerData[] }

/**
 * One request: who, where (their parcels on the aerial photo), what they
 * answered and wrote; where the team is with it (call, visit, offer) and
 * its notes; then « Créer la carte », where the offer is priced.
 */
export default function RequestShow({ request: initial, account, schema, statuses, layers }: Props) {
  const [request, setRequest] = useState(initial)
  const [notes, setNotes] = useState(initial.teamNotes ?? '')
  const [saved, setSaved] = useState(false)
  const [making, setMaking] = useState(false)

  async function save(patch: { status?: RequestStatus; team_notes?: string }) {
    const data = await api<{ request: RequestDetail }>(`/request_forms/${request.formId}/requests/${request.id}`, { method: 'PATCH', body: { request: patch } })
    setRequest(data.request)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  const hectares = request.areaM2 ? (request.areaM2 / 10_000).toLocaleString('fr-BE', { maximumFractionDigits: 2 }) : null
  const steps = statuses.filter((s) => s !== 'declined')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Head title={request.name} />
      <Link href="/request_forms" className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:text-prune-900">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('request_forms.requests.back')}
      </Link>
      <div>
        <p className="text-sm text-loam-500">{account} · {t('request_forms.requests.received', { when: relativeTime(request.createdAt) })}</p>
        <h1 className="mt-1 text-3xl">{request.name}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Card className="space-y-3">
            <h2 className="font-serif text-xl font-semibold text-prune-800">{t('request_forms.requests.place')}</h2>
            {request.address && <p className="text-loam-700">{request.address}</p>}
            {request.center ? (
              <div className="relative h-72 overflow-hidden rounded-xl ring-1 ring-loam-200">
                <MapView className="absolute inset-0" center={request.center} zoom={17}>
                  <PlacePreview request={request} layers={layers} />
                </MapView>
              </div>
            ) : (
              <p className="text-sm text-loam-500">{t('request_forms.requests.no_place')}</p>
            )}
            {request.parcels.length > 0 && (
              <p className="text-sm text-loam-600">
                {t('request_forms.index.parcels', { count: request.parcels.length })}
                {hectares && ` · ${t('request_forms.requests.area', { area: hectares })}`}
                {' · '}{request.parcels.map((p) => p.label || p.capakey).join(', ')}
              </p>
            )}
            {request.parcels.length > 0 && !request.boundary && <p className="text-sm text-humus-700">{t('request_forms.requests.no_outline')}</p>}
          </Card>

          <Card className="space-y-4">
            <h2 className="font-serif text-xl font-semibold text-prune-800">{t('request_forms.requests.answers')}</h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {schema.fields.map((field) => {
                const value = request.answers[field.key]
                const values = Array.isArray(value) ? value : value ? [value] : []
                return (
                  <div key={field.key}>
                    <dt className="text-sm text-loam-500">{t(`request_forms.requests.fields.${field.key}`)}</dt>
                    <dd className={clsx('text-sm', values.length ? 'text-loam-900' : 'text-loam-400')}>
                      {values.length ? values.map((v) => optionLabel(field.key, v)).join(', ') : t('request_forms.requests.not_answered')}
                    </dd>
                  </div>
                )
              })}
            </dl>
            {request.message && (
              <div>
                <p className="text-sm text-loam-500">{t('request_forms.requests.message')}</p>
                <p className="mt-1 whitespace-pre-line border-l-2 border-loam-200 pl-3 text-loam-800">{request.message}</p>
              </div>
            )}
            {request.photos.length > 0 && (
              <div>
                <p className="text-sm text-loam-500">{t('request_forms.requests.photos')}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {request.photos.map((photo) => (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-loam-200">
                      <img src={photo.url} alt={photo.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="space-y-3">
            <h2 className="font-medium text-loam-900">{t('request_forms.requests.contact')}</h2>
            <a href={`mailto:${request.email}`} className="flex items-center gap-2 break-all text-sm text-prune-700 hover:underline">
              <Mail className="h-4 w-4 shrink-0" aria-hidden />{request.email}
            </a>
            {request.phone && (
              <a href={`tel:${request.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-sm text-prune-700 hover:underline">
                <Phone className="h-4 w-4 shrink-0" aria-hidden />{request.phone}
              </a>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="font-medium text-loam-900">{t('request_forms.requests.status')}</h2>
            <ol className="space-y-1">
              {steps.map((status, i) => {
                const reached = request.status !== 'declined' && steps.indexOf(request.status) >= i
                return (
                  <li key={status}>
                    <button type="button" onClick={() => save({ status })}
                      className={clsx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-loam-50',
                        request.status === status ? 'font-medium text-loam-900' : 'text-loam-600')}>
                      <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1',
                        reached ? 'bg-leaf-500 text-white ring-leaf-500' : 'bg-white ring-loam-300')}>
                        {reached && <Check className="h-3 w-3" aria-hidden />}
                      </span>
                      {t(`request_forms.statuses.${status}`)}
                    </button>
                  </li>
                )
              })}
            </ol>
            <button type="button" onClick={() => save({ status: 'declined' })}
              className={clsx('rounded-full px-2.5 py-0.5 text-sm', request.status === 'declined' ? STATUS_TONE.declined : 'text-loam-500 hover:bg-loam-100')}>
              {t('request_forms.statuses.declined')}
            </button>
            <p className="text-sm text-loam-600">{t(`request_forms.status_hints.${request.status}`)}</p>
          </Card>

          <Card className="space-y-3">
            {request.mapId ? (
              <>
                <ButtonLink href={`/maps/${request.mapId}`} variant="secondary" className="w-full justify-center">
                  <MapIcon className="h-4 w-4" aria-hidden />{t('request_forms.requests.open_map')}
                </ButtonLink>
                <ButtonLink href={`/maps/${request.mapId}/offer`} className="w-full justify-center">
                  <Calculator className="h-4 w-4" aria-hidden />{t('request_forms.requests.open_offer')}
                </ButtonLink>
              </>
            ) : (
              <>
                <Button className="w-full justify-center" disabled={making}
                  onClick={() => router.post(`/request_forms/${request.formId}/requests/${request.id}/map`, {}, { onStart: () => setMaking(true), onFinish: () => setMaking(false) })}>
                  <MapIcon className="h-4 w-4" aria-hidden />{t('request_forms.requests.make_map')}
                </Button>
                <p className="text-sm text-loam-500">{t('request_forms.requests.make_map_hint')}</p>
              </>
            )}
          </Card>

          <Card>
            <Field label={t('request_forms.requests.notes')} hint={t('request_forms.requests.notes_help')}>
              <Textarea rows={6} value={notes} placeholder={t('request_forms.requests.notes_placeholder')}
                onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (request.teamNotes ?? '') && save({ team_notes: notes })} />
            </Field>
            {saved && <p className="mt-2 text-sm text-leaf-700">{t('request_forms.index.saved')}</p>}
          </Card>
        </aside>
      </div>
    </div>
  )
}

/** The aerial photo, the outline of the parcels (or the pin), framed. */
function PlacePreview({ request, layers }: { request: RequestDetail; layers: RegionLayerData[] }) {
  const instance = useMapInstance()

  useEffect(() => {
    if (!instance) return
    const photo = layers.find((l) => l.options.default === true) ?? layers[0]
    syncRegionLayers(instance, layers, { base: photo?.key ?? null, overlays: [], opacity: {}, bounds: null }, () => undefined)
  }, [instance, layers])

  useEffect(() => {
    if (!instance) return
    const boundary = request.boundary
    if (!boundary) {
      const marker = request.center ? new maplibregl.Marker({ color: '#5b5781' }).setLngLat(request.center).addTo(instance) : null
      return () => {
        marker?.remove()
      }
    }
    const draw = () => {
      if (instance.getSource('request-outline')) return
      instance.addSource('request-outline', { type: 'geojson', data: { type: 'Feature', geometry: boundary, properties: {} } })
      instance.addLayer({ id: 'request-outline-fill', type: 'fill', source: 'request-outline', paint: { 'fill-color': '#726b9f', 'fill-opacity': 0.2 } })
      instance.addLayer({ id: 'request-outline-line', type: 'line', source: 'request-outline', paint: { 'line-color': '#4a4668', 'line-width': 2.5 } })
    }
    if (instance.isStyleLoaded()) draw()
    else instance.once('load', draw)
    const coords = boundary.coordinates.flat(2) as [number, number][]
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
    instance.fitBounds(bounds, { padding: 32, duration: 0, maxZoom: 18 })
    return undefined
  }, [instance, request.boundary, request.center])

  return null
}
