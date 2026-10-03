import { Head } from '@inertiajs/react'
import { ChevronDown, Eye, X } from 'lucide-react'
import type { MapGeoJSONFeature } from 'maplibre-gl'
import { useEffect, useMemo, useState } from 'react'
import { Logo } from '@/components/Logo'
import { formatArea, formatLength, t } from '@/lib/i18n'
import { installPublicLayers } from '@/collab/publicLayers'
import { formatDate } from '@/collab/time'
import { measure } from '@/map/editor/measure'
import { installBoundary } from '@/map/layers/boundary'
import { FEATURES_SOURCE, LAYER_COLORS, installFeatureLayers } from '@/map/layers/features'
import { useMapInstance } from '@/map/MapContext'
import { MapView } from '@/map/MapView'
import type { MapFeature } from '@/types'
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
        </MapView>
        {props.description && <About text={props.description} />}
        <Legend {...props} />
        {selected && <FeatureCard feature={selected} onClose={() => setSelectedId(null)} />}
      </div>
      <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-loam-200 bg-white px-3 text-xs text-loam-500">
        <span>{t('public_maps.published_on', { date: formatDate(props.publishedAt) })}</span>
        <a href="/" className="font-medium text-prune-700 hover:underline">{t('public_maps.made_with')}</a>
      </footer>
    </div>
  )
}

function PublicLayers({ layers, features, map, selectedId, onSelect }: PublicMapProps & { selectedId: number | null; onSelect: (id: number | null) => void }) {
  const instance = useMapInstance()

  useEffect(() => {
    if (!instance) return
    const remove = installPublicLayers(instance, layers)
    installBoundary(instance, map.boundary)
    installFeatureLayers(instance, features as never)
    return remove
  }, [instance, layers, features, map.boundary])

  useEffect(() => {
    if (!instance || selectedId == null) return
    instance.setFeatureState({ source: FEATURES_SOURCE, id: selectedId }, { selected: true })
    return () => {
      if (instance.getSource(FEATURES_SOURCE)) instance.setFeatureState({ source: FEATURES_SOURCE, id: selectedId }, { selected: false })
    }
  }, [instance, selectedId])

  useEffect(() => {
    if (!instance) return
    const ids = ['features-point', 'features-line', 'features-fill']
    const onClick = (e: { features?: MapGeoJSONFeature[] }) => {
      const hit = e.features?.[0]
      if (hit?.id != null) onSelect(Number(hit.id))
    }
    const onMapClick = (e: { point: { x: number; y: number } }) => {
      if (instance.queryRenderedFeatures([e.point.x, e.point.y], { layers: ids.filter((i) => instance.getLayer(i)) }).length === 0) onSelect(null)
    }
    const enter = () => { instance.getCanvas().style.cursor = 'pointer' }
    const leave = () => { instance.getCanvas().style.cursor = '' }
    ids.forEach((i) => { instance.on('click', i, onClick); instance.on('mouseenter', i, enter); instance.on('mouseleave', i, leave) })
    instance.on('click', onMapClick)
    return () => {
      ids.forEach((i) => { instance.off('click', i, onClick); instance.off('mouseenter', i, enter); instance.off('mouseleave', i, leave) })
      instance.off('click', onMapClick)
    }
  }, [instance, onSelect])

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

function Legend({ features, layers }: Pick<PublicMapProps, 'features' | 'layers'>) {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    features.features.forEach((f) => result.set(f.properties.layer, (result.get(f.properties.layer) ?? 0) + 1))
    return [...result.entries()]
  }, [features])
  const overlays = layers.filter((l) => l.category === 'overlay')
  if (counts.length === 0 && overlays.length === 0) return null
  return (
    <section className="absolute bottom-14 left-2 z-10 max-w-[min(18rem,calc(100%-1rem))] rounded-xl bg-white p-3 shadow-lg ring-1 ring-loam-200" aria-label={t('public_maps.legend')}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
        {t('public_maps.legend')}
        <ChevronDown className={'h-4 w-4 transition ' + (open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm text-loam-700">
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
                  {layer.legendUrl && <img src={layer.legendUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="mt-0.5 max-h-24 max-w-full" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function FeatureCard({ feature, onClose }: { feature: MapFeature; onClose: () => void }) {
  const p = feature.properties
  const m = measure(feature.geometry)
  return (
    <aside className="absolute inset-x-2 bottom-12 z-20 rounded-xl bg-white p-4 shadow-xl ring-1 ring-loam-200 md:inset-x-auto md:bottom-14 md:right-3 md:w-72" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-loam-400">
            <span className="h-2 w-2 rounded-full" style={{ background: LAYER_COLORS[p.layer] ?? '#6e6355' }} />
            {t(`editor.layers.${p.layer}`)} · {t(`editor.kinds.${p.kind}`)}
          </p>
          <h2 className="mt-1 text-base">{p.name || t(`editor.kinds.${p.kind}`)}</h2>
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
