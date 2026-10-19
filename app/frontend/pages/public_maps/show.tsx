import { Head } from '@inertiajs/react'
import { ChevronDown, Drone, Eye, X } from 'lucide-react'
import { area } from '@turf/turf'
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Logo } from '@/components/Logo'
import { LayerLegend } from '@/components/legend/LayerLegend'
import { track } from '@/lib/analytics'
import { formatArea, formatLength, t } from '@/lib/i18n'
import { installPublicLayers } from '@/collab/publicLayers'
import { formatDate } from '@/collab/time'
import { aerialViewLabel } from '@/drone/format'
import { installPublicAerialView } from '@/drone/layers'
import { measure } from '@/map/editor/measure'
import { featureAt, hitsAt } from '@/map/featurePick'
import { installBoundary } from '@/map/layers/boundary'
import { FEATURES_SOURCE, LAYER_COLORS, installFeatureLayers } from '@/map/layers/features'
import { useMapInstance } from '@/map/MapContext'
import { MapView } from '@/map/MapView'
import { displayGeometry } from '@/map/zones/zones'
import type { MapFeature } from '@/types'
import { GardenControls } from '@/public_maps/GardenControls'
import { SEASONS, gardenAt, gardenPlants, seasonOf, yearFraction, yearNow, type GardenPlant, type SeasonKey } from '@/public_maps/garden'
import { loadAtlases, paintGarden, removeGarden, type Atlases } from '@/public_maps/gardenLayer'
import { previewYear } from '@/public_maps/preview'
import { plantLegend, plantNumber, plantNumbersAt, type StrataGroup } from '@/public_maps/plantNumbers'
import { paintPlantNumbers, removePlantNumbers, setNamesVisible, setPlantNumbersVisible } from '@/public_maps/plantNumbersLayer'
import { strataLabel } from '@/components/plants/format'
import { STRATA_COLORS, inkOn } from '@/map/plants/strataColors'
import type { PublicMapProps } from '@/types/collab'

/**
 * A published map: read-only, no account, no editing, no comments. What it
 * shows is the snapshot the owner published (boundary, chosen layers,
 * region base layers), with a legend and its attribution.
 */
export default function PublicMapShow(props: PublicMapProps) {
  const { map } = props
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = props.features.features.find((f) => f.properties.id === selectedId) ?? null
  const plants = useMemo(() => (props.growth ? gardenPlants(props.growth) : []), [props.growth])
  const [now] = useState(() => new Date())
  const today = props.growth ? yearNow(props.growth, now) : 0
  const season = seasonOf(yearFraction(now))
  const [moment, setMoment] = useState<{ year: number; season: SeasonKey }>({ year: today, season })
  const onMoment = useCallback((year: number, chosen: SeasonKey) => setMoment({ year, season: chosen }), [])
  // What the visitor writes on the map: names of zones and elements, plant numbers.
  const [showNames, setShowNames] = useState(true)
  const [showNumbers, setShowNumbers] = useState(true)
  const legend = useMemo(() => (props.growth ? plantLegend(props.growth, t('public_maps.display.unnamed_plant')) : []), [props.growth])

  // Where the visitor came from: ?via=… on links Terranova makes, else direct.
  useEffect(() => {
    const via = new URLSearchParams(window.location.search).get('via')
    track('public_map_view', { source: via && /^[a-z_]{1,20}$/.test(via) ? via : 'direct' })
  }, [])

  return (
    <div className="flex h-dvh flex-col bg-loam-100">
      <Head title={props.title}>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-loam-200 bg-white px-3">
        <Logo className="h-7 w-7 shrink-0" />
        <h1 className="truncate text-base">{props.title}</h1>
        {map.areaM2 != null && <span className="hidden text-sm text-loam-400 sm:inline">{formatArea(map.areaM2)}</span>}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-loam-100 px-2.5 py-0.5 text-xs text-loam-600">
          <Eye className="h-3.5 w-3.5" />
          {t('public_maps.read_only')}
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        <MapView
          className="absolute inset-0"
          center={map.center ?? undefined}
          zoom={map.zoom ?? (map.center ? 17 : 8)}
          bbox={map.bbox}
        >
          <PublicLayers {...props} selectedId={selectedId} onSelect={setSelectedId} />
          {plants.length > 0 && <Garden plants={plants} year={moment.year} season={moment.season} latitude={map.center?.[1] ?? plants[0].lat} />}
          {props.growth && props.growth.plants.length > 0 && <PlantNumbers growth={props.growth} year={moment.year} visible={showNumbers} />}
          <Names visible={showNames} />
        </MapView>
        {props.description && <About text={props.description} />}
        {props.growth && plants.length > 0 && (
          <GardenControls
            origin={props.growth.origin}
            today={today}
            growTo={previewYear(today)}
            season={season}
            onChange={onMoment}
            className="absolute inset-x-2 bottom-10 md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:w-96"
          />
        )}
        <Legend
          {...props}
          raised={plants.length > 0}
          plantGroups={legend}
          showNames={showNames}
          onShowNames={setShowNames}
          showNumbers={showNumbers}
          onShowNumbers={setShowNumbers}
        />
        {selected && <FeatureCard feature={selected} plant={props.growth?.plants.find((p) => p.id === selected.properties.id)} onClose={() => setSelectedId(null)} />}
      </div>
      <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-loam-200 bg-white px-3 text-xs text-loam-500">
        <span>{t('public_maps.published_on', { date: formatDate(props.publishedAt) })}</span>
        {props.aerialView && (
          <span className="hidden min-w-0 items-center gap-1 truncate sm:inline-flex"><Drone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{aerialViewLabel(props.aerialView)}</span>
        )}
        <a href="/" className="font-medium text-prune-700 hover:underline">{t('public_maps.made_with')}</a>
      </footer>
    </div>
  )
}

function PublicLayers({ layers, features, map, aerialView, selectedId, onSelect }: PublicMapProps & { selectedId: number | null; onSelect: (id: number | null) => void }) {
  const instance = useMapInstance()

  useEffect(() => {
    if (!instance) return
    const remove = installPublicLayers(instance, layers)
    const removeAerial = aerialView ? installPublicAerialView(instance, aerialView, layers) : null
    installBoundary(instance, map.boundary)
    installFeatureLayers(instance, features as never)
    return () => {
      removeAerial?.()
      remove()
    }
  }, [instance, layers, aerialView, features, map.boundary])

  useEffect(() => {
    if (!instance || selectedId == null) return
    instance.setFeatureState({ source: FEATURES_SOURCE, id: selectedId }, { selected: true })
    return () => {
      if (instance.getSource(FEATURES_SOURCE)) instance.setFeatureState({ source: FEATURES_SOURCE, id: selectedId }, { selected: false })
    }
  }, [instance, selectedId])

  useEffect(() => {
    if (!instance) return
    // The most precise element under the cursor wins (a plant over its zone), see `featurePick`.
    const areaOf = (id: number) => {
      const feature = (features.features as MapFeature[]).find((f) => f.properties.id === id)
      return feature ? area(feature) : Infinity
    }
    const onClick = (e: MapMouseEvent) => onSelect(featureAt(instance, e.point, areaOf))
    let over = false
    const onMove = (e: MapMouseEvent) => {
      const now = hitsAt(instance, e.point).some((hit) => hit.id != null)
      if (now === over) return
      over = now
      instance.getCanvas().style.cursor = now ? 'pointer' : ''
    }
    instance.on('click', onClick)
    instance.on('mousemove', onMove)
    return () => {
      instance.off('click', onClick)
      instance.off('mousemove', onMove)
    }
  }, [instance, onSelect, features])

  return null
}

/** The watercolour crowns of the published plants, at the year and season of the bar. */
function Garden({ plants, year, season, latitude }: { plants: GardenPlant[]; year: number; season: SeasonKey; latitude: number }) {
  const instance = useMapInstance()
  const [atlases, setAtlases] = useState<Atlases | null>(null)

  useEffect(() => {
    let alive = true
    loadAtlases().then((loaded) => alive && setAtlases(loaded), () => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!instance || !atlases) return
    const paint = () => paintGarden(instance, atlases, gardenAt(plants, year, SEASONS[season]), latitude)
    if (instance.isStyleLoaded()) paint()
    else instance.once('load', paint)
  }, [instance, atlases, plants, year, season, latitude])

  useEffect(() => () => {
    if (instance?.getStyle()) removeGarden(instance)
  }, [instance])

  return null
}

/** Each plant point's number in a pastille of its strata colour, hollow until planted. */
function PlantNumbers({ growth, year, visible }: { growth: NonNullable<PublicMapProps['growth']>; year: number; visible: boolean }) {
  const instance = useMapInstance()
  // Whole years: a pastille fills the year its plant goes into the ground.
  const shown = Math.floor(year + 1e-6)

  useEffect(() => {
    if (!instance) return
    whenStyleReady(instance, () => {
      paintPlantNumbers(instance, plantNumbersAt(growth, shown))
      setPlantNumbersVisible(instance, visible)
    })
  }, [instance, growth, shown, visible])

  useEffect(() => () => {
    if (instance?.getStyle()) removePlantNumbers(instance)
  }, [instance])

  return null
}

/**
 * Runs `fn` now, or once the style accepts sources. `isStyleLoaded()` is
 * also false while tiles or crowns load, and `load` fires only once: a
 * change made then would wait forever.
 */
function whenStyleReady(map: MapLibreMap, fn: () => void) {
  const run = () => {
    try {
      fn()
    } catch {
      map.once('idle', run)
    }
  }
  run()
}

/** Shows or hides the names written on the map (zones, paths, named elements). */
function Names({ visible }: { visible: boolean }) {
  const instance = useMapInstance()
  useEffect(() => {
    if (!instance) return
    whenStyleReady(instance, () => setNamesVisible(instance, visible))
  }, [instance, visible])
  return null
}

function About({ text }: { text: string }) {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  return (
    <section className="absolute left-2 top-2 z-10 max-w-[min(22rem,calc(100%-1rem))] rounded-xl bg-white p-3 shadow-lg ring-1 ring-loam-200">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
        {t('public_maps.about')}
        <ChevronDown className={'h-4 w-4 transition ' + (open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>
      {open && <p className="mt-1 whitespace-pre-line text-sm text-loam-700">{text}</p>}
    </section>
  )
}

type DisplayProps = {
  plantGroups: StrataGroup[]
  showNames: boolean
  onShowNames: (show: boolean) => void
  showNumbers: boolean
  onShowNumbers: (show: boolean) => void
}

function Legend({ features, layers, raised, plantGroups, showNames, onShowNames, showNumbers, onShowNumbers }: Pick<PublicMapProps, 'features' | 'layers'> & { raised: boolean } & DisplayProps) {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    features.features.forEach((f) => result.set(f.properties.layer, (result.get(f.properties.layer) ?? 0) + 1))
    return [...result.entries()]
  }, [features])
  const overlays = layers.filter((l) => l.category === 'overlay')
  const named = useMemo(() => features.features.some((f) => f.properties.name), [features])
  if (counts.length === 0 && overlays.length === 0) return null
  return (
    <section className={(raised ? 'bottom-52 md:bottom-14' : 'bottom-14') + ' absolute left-2 z-10 max-w-[min(18rem,calc(100%-1rem))] rounded-xl bg-white p-3 shadow-lg ring-1 ring-loam-200'} aria-label={t('public_maps.legend')}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
        {t('public_maps.legend')}
        <ChevronDown className={'h-4 w-4 transition ' + (open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-2 max-h-[min(24rem,50dvh)] space-y-2 overflow-y-auto text-sm text-loam-700">
          {(named || plantGroups.length > 0) && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('public_maps.display.title')}>
              {named && <Toggle on={showNames} onChange={onShowNames} label={t('public_maps.display.names')} />}
              {plantGroups.length > 0 && <Toggle on={showNumbers} onChange={onShowNumbers} label={t('public_maps.display.numbers')} />}
            </div>
          )}
          {plantGroups.length > 0 && <PlantLegend groups={plantGroups} />}
          <ul className="space-y-1">
            {counts.map(([layer, count]) => (
              <li key={layer} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LAYER_COLORS[layer] ?? '#6e6355' }} />
                {t(`editor.layers.${layer}`)}
                <span className="text-xs text-loam-400">{count}</span>
              </li>
            ))}
          </ul>
          {overlays.length > 0 && (
            <ul className="space-y-1.5 border-t border-loam-100 pt-2">
              {overlays.map((layer) => (
                <li key={layer.key}>
                  <span className="text-xs text-loam-600">{layer.name}</span>
                  <div className="mt-1">
                    <LayerLegend layer={layer} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

/** A switch written as a pill: on, it is filled. */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={'rounded-full px-3 py-1 text-sm ring-1 transition ' + (on ? 'bg-prune-700 text-white ring-prune-700' : 'bg-white text-loam-600 ring-loam-200 hover:bg-loam-50')}
    >
      {label}
    </button>
  )
}

/** The plants by strata, each species with its numbers (« 3, 5–7 »), as a planting plan's key. */
function PlantLegend({ groups }: { groups: StrataGroup[] }) {
  return (
    <ul className="space-y-1.5 border-b border-loam-100 pb-2" aria-label={t('public_maps.display.plants')}>
      {groups.map((group) => (
        <li key={group.strata}>
          <p className="flex items-center gap-2 font-medium">
            <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white" style={{ background: STRATA_COLORS[group.strata] }} />
            {strataLabel(group.strata)}
            <span className="text-sm font-normal text-loam-400">{group.count}</span>
          </p>
          <ul className="ml-5 mt-0.5 space-y-0.5">
            {group.species.map((species) => (
              <li key={species.name} className="text-sm text-loam-600">
                {species.numbers && <span className="mr-1.5 font-medium tabular-nums text-loam-800">{species.numbers}</span>}
                {species.name}
                {!species.numbers && species.count > 1 && <span className="ml-1 text-loam-400">× {species.count}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function FeatureCard({ feature, plant, onClose }: { feature: MapFeature; plant?: NonNullable<PublicMapProps['growth']>['plants'][number]; onClose: () => void }) {
  const p = feature.properties
  const m = measure(displayGeometry(feature))
  const number = plantNumber(plant?.number)
  return (
    <aside className="absolute inset-x-2 bottom-12 z-20 rounded-xl bg-white p-4 shadow-xl ring-1 ring-loam-200 md:inset-x-auto md:bottom-14 md:right-3 md:w-72" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-loam-400">
            <span className="h-2 w-2 rounded-full" style={{ background: LAYER_COLORS[p.layer] ?? '#6e6355' }} />
            {t(`editor.layers.${p.layer}`)} · {t(`editor.kinds.${p.kind}`)}
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-base">
            {number && plant && (
              <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-sm" style={{ background: STRATA_COLORS[plant.strata], color: inkOn(STRATA_COLORS[plant.strata]) }}>{number}</span>
            )}
            {p.name || plant?.name || t(`editor.kinds.${p.kind}`)}
          </h2>
          {plant && (
            <p className="text-sm text-loam-500">{[p.name ? plant.name : null, strataLabel(plant.strata)].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {(m.area != null || m.length != null) && (
        <dl className="mt-2 flex gap-4 text-sm">
          {m.area != null && <div><dt className="text-xs text-loam-500">{t('editor.measure.area')}</dt><dd>{formatArea(m.area)}</dd></div>}
          {m.length != null && <div><dt className="text-xs text-loam-500">{t(m.area != null ? 'editor.measure.perimeter' : 'editor.measure.length')}</dt><dd>{formatLength(m.length)}</dd></div>}
        </dl>
      )}
      {p.notes && <p className="mt-2 whitespace-pre-line text-sm text-loam-700">{p.notes}</p>}
    </aside>
  )
}
