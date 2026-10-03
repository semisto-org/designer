import { Head, useForm } from '@inertiajs/react'
import clsx from 'clsx'
import * as maplibregl from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { MapView } from '@/map/MapView'
import { useMapInstance } from '@/map/MapContext'
import { AddressSearch } from '@/map/data/AddressSearch'
import { syncRegionLayers } from '@/map/layers/region'
import type { LngLat, RegionData, RegionLayerData } from '@/types'
import type { GeocodeResult } from '@/types/map_data'

type NextStep = 'parcels' | 'draw' | 'import' | 'later'
const NEXT_STEPS: NextStep[] = ['parcels', 'draw', 'import', 'later']

type Focus = { center: LngLat; zoom: number; key: number }

type FormData = {
  map: { name: string; address: string; description: string; center: LngLat | null; zoom: number | null }
  next: NextStep
}

/**
 * "Nouvelle carte": a name, the terrain's address (the map opens there,
 * on the aerial photo), and what to do next — pick the cadastral parcels,
 * draw the outline or import a file.
 */
export default function MapsNew({ region, layers = [] }: { region: RegionData; layers?: RegionLayerData[] }) {
  const form = useForm<FormData>({
    map: { name: '', address: '', description: '', center: null, zoom: null },
    next: 'parcels',
  })
  const { map } = form.data
  const setMap = (patch: Partial<FormData['map']>) => form.setData('map', { ...form.data.map, ...patch })
  const [focus, setFocus] = useState<Focus | null>(null)

  function choose(result: GeocodeResult) {
    const center: LngLat = [result.lng, result.lat]
    setMap({ address: result.label, center, zoom: result.zoom })
    setFocus({ center, zoom: result.zoom, key: Date.now() })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Head title={t('maps.new.title')} />
      <h1 className="text-2xl">{t('maps.new.title')}</h1>
      <p className="mt-2 text-loam-500">{t('map_data.new.intro', { region: region.name })}</p>
      <Card className="mt-6">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            form.transform((data) => ({ ...data, next: data.next === 'later' ? '' : data.next }))
            form.post('/maps')
          }}
        >
          <Field label={t('maps.fields.name')} error={form.errors['map.name' as keyof typeof form.errors]}>
            <Input
              required
              value={map.name}
              onChange={(e) => setMap({ name: e.target.value })}
              placeholder={t('maps.new.name_placeholder')}
            />
          </Field>

          <div className="space-y-2">
            <AddressSearch
              regionId={region.id}
              label={t('map_data.new.address_label')}
              placeholder={t('map_data.new.address_placeholder')}
              onSelect={choose}
            />
            <p className="text-xs text-loam-500">
              {map.center ? t('map_data.new.address_chosen') : t('map_data.new.address_hint')}
            </p>
            <div className="relative h-56 overflow-hidden rounded-lg ring-1 ring-loam-200 sm:h-64">
              <MapView className="absolute inset-0" center={region.center} zoom={region.defaultZoom}>
                <PreviewMap layers={layers} region={region} pin={map.center} focus={focus} onMove={(center) => setMap({ center })} />
              </MapView>
            </div>
          </div>

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

          <Field label={t('maps.fields.description')}>
            <Textarea rows={3} value={map.description} onChange={(e) => setMap({ description: e.target.value })} />
          </Field>

          <Button type="submit" disabled={form.processing} size="lg" className="w-full sm:w-auto">
            {t('maps.new.submit')}
          </Button>
        </form>
      </Card>
    </div>
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
