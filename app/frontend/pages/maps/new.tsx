import { Head, useForm } from '@inertiajs/react'
import clsx from 'clsx'
import * as maplibregl from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { plansHref } from '@/components/billing/PlanGate'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { MapView } from '@/map/MapView'
import { useMapInstance } from '@/map/MapContext'
import { AddressSearch } from '@/map/data/AddressSearch'
import { syncRegionLayers } from '@/map/layers/region'
import { elides, townOf } from '@/lib/placeName'
import type { LngLat, RegionData, RegionLayerData } from '@/types'
import type { GeocodeResult } from '@/types/map_data'

type NextStep = 'parcels' | 'draw' | 'import' | 'later'
const NEXT_STEPS: NextStep[] = ['parcels', 'draw', 'import', 'later']

type Focus = { center: LngLat; zoom: number; key: number }

type FormData = {
  map: { name: string; address: string; description: string; center: LngLat | null; zoom: number | null; team_id: number | null }
  next: NextStep
}

/** Where the new map can go: my own maps (teamId null) or one of my teams, with their room. */
type Space = { teamId: number | null; name: string | null; canCreate: boolean; teamPaid: boolean }

/** ?team= when that space has room, else the first space with room (my own maps first). */
function initialSpace(spaces: Space[]): number | null {
  const asked = Number(new URLSearchParams(window.location.search).get('team')) || null
  const open = spaces.filter((space) => space.canCreate)
  return (open.find((space) => space.teamId === asked) ?? open[0])?.teamId ?? null
}

/** The name the server gives a map left unnamed (Map.name_for_address). */
function proposedName(address: string): string {
  const town = townOf(address)
  if (!town) return t('trials.map_name')
  return t(elides(town) ? 'trials.map_name_elided' : 'trials.map_name_in', { town })
}

/**
 * "Nouvelle carte": the terrain's address first (the map opens there, on the
 * aerial photo), then a name, which the place gives when left empty
 * (« Le terrain de Purnode »), and what to do next — pick the cadastral
 * parcels, draw the outline or import a file.
 */
export default function MapsNew({ region: baseRegion, layers: baseLayers = [], spaces = [] }: { region: RegionData; layers?: RegionLayerData[]; spaces?: Space[] }) {
  const form = useForm<FormData>({
    // ?name=: the quick switcher's « Créer la carte « … » » writes it in.
    map: {
      name: new URLSearchParams(window.location.search).get('name')?.slice(0, 120) ?? '',
      address: '', description: '', center: null, zoom: null, team_id: initialSpace(spaces),
    },
    next: 'parcels',
  })
  const { map } = form.data
  // Every space is full: say so before the person types anything, rather
  // than refusing the map once the form is filled in.
  const full = spaces.length > 0 && !spaces.some((space) => space.canCreate)
  const setMap = (patch: Partial<FormData['map']>) => form.setData('map', { ...form.data.map, ...patch })
  const [focus, setFocus] = useState<Focus | null>(null)
  // The region of the chosen place (its base maps: the aerial photo where
  // one exists); the page opens on the pan-European base.
  const [located, setLocated] = useState<{ region: RegionData; layers: RegionLayerData[] } | null>(null)
  const region = located?.region ?? baseRegion
  const layers = located?.layers ?? baseLayers
  const lng = map.center?.[0]
  const lat = map.center?.[1]

  useEffect(() => {
    if (lng === undefined || lat === undefined) return
    const controller = new AbortController()
    api<{ region: RegionData; layers: RegionLayerData[] }>(`/regions/locate?lng=${lng}&lat=${lat}`, { signal: controller.signal })
      .then((data) => setLocated((current) => (current?.region.id === data.region.id ? current : data)))
      .catch(() => undefined)
    return () => controller.abort()
  }, [lng, lat])

  function choose(result: GeocodeResult) {
    const center: LngLat = [result.lng, result.lat]
    setMap({ address: result.label, center, zoom: result.zoom })
    setFocus({ center, zoom: result.zoom, key: Date.now() })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Head title={t('maps.new.title')} />
      <h1 className="text-2xl">{t('maps.new.title')}</h1>
      <p className="mt-2 text-loam-500">{t('map_data.new.intro')}</p>
      {full && (
        <div role="status" className="mt-6 flex flex-col items-start gap-3 rounded-2xl bg-humus-50 p-4 ring-1 ring-inset ring-humus-200">
          <p className="text-sm text-loam-700">{t('maps.index.limit_reason')}</p>
          <ButtonLink href={plansHref({ returnTo: '/maps/new' })} variant="secondary" size="sm">{t('maps.index.upgrade')}</ButtonLink>
        </div>
      )}
      <Card className="mt-6">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            form.transform((data) => ({ ...data, next: data.next === 'later' ? '' : data.next }))
            form.post('/maps')
          }}
        >
          <div className="space-y-2">
            <AddressSearch
              regionId={baseRegion.id}
              label={t('map_data.new.address_label')}
              placeholder={t('map_data.new.address_placeholder')}
              onSelect={choose}
            />
            <p className="text-xs text-loam-500">
              {map.center ? t('map_data.new.address_chosen') : t('map_data.new.address_hint')}
            </p>
            {located && (
              <p className="text-xs text-loam-600">
                {located.region.key === 'europe'
                  ? t('map_data.new.region_europe')
                  : t('map_data.new.region_found', { region: located.region.name })}
              </p>
            )}
            <div className="relative h-56 overflow-hidden rounded-lg ring-1 ring-loam-200 sm:h-64">
              <MapView className="absolute inset-0" center={baseRegion.center} zoom={baseRegion.defaultZoom}>
                <PreviewMap layers={layers} region={region} pin={map.center} focus={focus} onMove={(center) => setMap({ center })} />
              </MapView>
            </div>
          </div>

          <Field
            label={t('maps.fields.name')}
            hint={t('maps.new.name_hint')}
            error={form.errors['map.name' as keyof typeof form.errors]}
          >
            <Input
              value={map.name}
              onChange={(e) => setMap({ name: e.target.value })}
              placeholder={map.address ? proposedName(map.address) : t('maps.new.name_placeholder')}
            />
          </Field>

          <fieldset>
            <legend className="text-sm font-medium text-loam-700">{t('map_data.new.next_label')}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {NEXT_STEPS.map((step) => (
                <label
                  key={step}
                  className={clsx(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg p-3 ring-1 ring-inset transition-colors',
                    form.data.next === step ? 'bg-prune-50 ring-prune-400' : 'ring-loam-200 hover:bg-loam-50',
                  )}
                >
                  <input
                    type="radio"
                    name="next"
                    value={step}
                    checked={form.data.next === step}
                    onChange={() => form.setData('next', step)}
                    className="mt-0.5 h-4 w-4 border-loam-300 text-prune-600 focus:ring-prune-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-loam-800">{t(`map_data.new.next.${step}`)}</span>
                    <span className="block text-xs text-loam-500">{t(`map_data.new.next.${step}_hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {spaces.length > 1 && (
            <SpacePicker spaces={spaces} value={map.team_id} onChange={(team_id) => setMap({ team_id })} />
          )}

          <Field label={t('maps.fields.description')}>
            <Textarea rows={3} value={map.description} onChange={(e) => setMap({ description: e.target.value })} />
          </Field>

          <Button type="submit" disabled={form.processing || full} size="lg" className="w-full sm:w-auto">
            {t('maps.new.submit')}
          </Button>
        </form>
      </Card>
    </div>
  )
}

/**
 * « Où ranger cette carte ? »: my own maps or one of my teams. A team someone
 * pays for has its own room, so a member whose own plan is full still adds
 * maps there; a full space stays listed, greyed, with why.
 */
function SpacePicker({ spaces, value, onChange }: { spaces: Space[]; value: number | null; onChange: (teamId: number | null) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-loam-700">{t('teams.new_map.label')}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {spaces.map((space) => {
          const own = space.teamId === null
          const hint = !space.canCreate
            ? t(own ? 'teams.new_map.full_own' : 'teams.new_map.full_team')
            : t(own ? 'teams.new_map.own_hint' : space.teamPaid ? 'teams.new_map.team_hint_paid' : 'teams.new_map.team_hint')
          return (
            <label
              key={space.teamId ?? 'own'}
              className={clsx(
                'flex items-start gap-2.5 rounded-lg p-3 ring-1 ring-inset transition-colors',
                !space.canCreate ? 'cursor-not-allowed opacity-60 ring-loam-200'
                  : value === space.teamId ? 'cursor-pointer bg-prune-50 ring-prune-400' : 'cursor-pointer ring-loam-200 hover:bg-loam-50',
              )}
            >
              <input
                type="radio"
                name="space"
                checked={value === space.teamId}
                disabled={!space.canCreate}
                onChange={() => onChange(space.teamId)}
                className="mt-0.5 h-4 w-4 border-loam-300 text-prune-600 focus:ring-prune-500"
              />
              <span>
                <span className="block text-sm font-medium text-loam-800">
                  {own ? t('teams.new_map.own') : t('teams.new_map.team', { name: space.name ?? '' })}
                </span>
                <span className="block text-sm text-loam-500">{hint}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * The region on its neutral plan, then the chosen place on the default base
 * (the aerial photo); the pin can be dragged or moved with a tap.
 */
function PreviewMap({ layers, region, pin, focus, onMove }: {
  layers: RegionLayerData[]
  region: RegionData
  pin: LngLat | null
  focus: Focus | null
  onMove: (center: LngLat) => void
}) {
  const instance = useMapInstance()
  const marker = useRef<maplibregl.Marker | null>(null)
  const move = useRef(onMove)
  move.current = onMove
  const located = focus !== null

  useEffect(() => {
    if (!instance) return
    const plan = layers.find((l) => l.kind === 'style') ?? layers[0]
    const photo = layers.find((l) => l.options.default === true) ?? plan
    const base = (located ? photo : plan)?.key ?? null
    syncRegionLayers(instance, layers, { base, overlays: [], opacity: {}, bounds: region.bounds }, () => undefined)
  }, [instance, layers, region.bounds, located])

  useEffect(() => {
    if (!instance || !focus) return
    instance.resize()
    instance.jumpTo({ center: focus.center, zoom: Math.min(focus.zoom, 18) })
  }, [instance, focus])

  useEffect(() => {
    if (!instance) return
    if (!pin) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (!marker.current) {
      const m = new maplibregl.Marker({ color: '#5b5781', draggable: true }).setLngLat(pin).addTo(instance)
      m.on('dragend', () => {
        const { lng, lat } = m.getLngLat()
        move.current([lng, lat])
      })
      marker.current = m
    } else {
      marker.current.setLngLat(pin)
    }
  }, [instance, pin])

  useEffect(() => {
    if (!instance) return
    const onClick = (e: MapMouseEvent) => {
      if (marker.current) move.current([e.lngLat.lng, e.lngLat.lat])
    }
    instance.on('click', onClick)
    return () => {
      instance.off('click', onClick)
    }
  }, [instance])

  useEffect(() => () => {
    marker.current?.remove()
  }, [])
  return null
}
