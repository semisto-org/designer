import { Link } from '@inertiajs/react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { ArrowRight, Sprout, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '@/lib/money'
import { t } from '@/lib/i18n'
import { useMapInstance } from '@/map/MapContext'
import { MapView } from '@/map/MapView'
import type { SpeciesPlantings } from '@/types/plants'

type Point = SpeciesPlantings['points'][number]

const SOURCE = 'species-plantings'
const LAYER = 'species-plantings-points'
const IN_GROUND = '#6d7a00' // leaf-600
const PLANNED = '#5b5781' // prune-600

/**
 * Where a species grows on the maps the viewer can open: one dot per plant,
 * filled when it is in the ground, hollow while it is only planned. A dot
 * opens its map with the plant selected.
 */
export function SpeciesPlantingsMap({ plantings }: { plantings: SpeciesPlantings }) {
  const [picked, setPicked] = useState<Point | null>(null)
  const maps = useMemo(() => new Map(plantings.maps.map((m) => [m.id, m])), [plantings.maps])
  const pickedMap = picked ? maps.get(picked.mapId) : null

  return (
    <div className="space-y-3">
      <div className="relative h-80 overflow-hidden rounded-xl ring-1 ring-loam-200 sm:h-96">
        <MapView className="absolute inset-0" scalePosition="bottom-right">
          <PlantingPoints points={plantings.points} onPick={setPicked} />
        </MapView>
        {picked && pickedMap && (
          <div className="absolute inset-x-3 bottom-3 z-10 max-w-sm rounded-2xl bg-white p-4 text-sm shadow-lg ring-1 ring-loam-200 sm:left-3 sm:right-auto">
            <button type="button" onClick={() => setPicked(null)} className="absolute right-2 top-2 rounded-full p-1 text-loam-400 hover:bg-loam-100 hover:text-loam-700" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
            <p className="pr-6 font-medium text-loam-900">{pickedMap.name}</p>
            {picked.variety && <p className="text-loam-600">{picked.variety}</p>}
            <p className="mt-1 text-loam-600">
              {picked.plantedOn
                ? t('plants.show.plantings_planted_on', { date: formatDate(picked.plantedOn) })
                : picked.inGround ? t('plants.show.plantings_legend_in_ground') : t('plants.show.plantings_legend_planned')}
            </p>
            <Link href={`/maps/${picked.mapId}?feature=${picked.id}`} className="mt-2 inline-flex items-center gap-1 font-medium text-prune-700 hover:text-prune-900">
              {t('plants.show.plantings_open')}<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-loam-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: IN_GROUND }} />{t('plants.show.plantings_legend_in_ground')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 2px ${PLANNED}` }} />{t('plants.show.plantings_legend_planned')}
        </span>
      </div>

      <ul className="divide-y divide-loam-100 text-sm">
        {plantings.maps.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
            <Link href={`/maps/${m.id}`} className="font-medium text-loam-800 hover:text-prune-700">{m.name}</Link>
            <span className="inline-flex flex-wrap gap-x-3 text-loam-600">
              {m.inGround > 0 && (
                <span className="inline-flex items-center gap-1 text-leaf-700"><Sprout className="h-4 w-4" aria-hidden />{t('plants.show.plantings_in_ground', { count: m.inGround })}</span>
              )}
              {m.planned > 0 && <span>{t('plants.show.plantings_planned', { count: m.planned })}</span>}
            </span>
          </li>
        ))}
      </ul>
      {plantings.truncated && <p className="text-sm text-loam-500">{t('plants.show.plantings_truncated', { count: plantings.points.length })}</p>}
    </div>
  )
}

function PlantingPoints({ points, onPick }: { points: Point[]; onPick: (point: Point | null) => void }) {
  const instance = useMapInstance()

  useEffect(() => {
    if (!instance || points.length === 0) return
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature', id: p.id,
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { id: p.id, inGround: p.inGround },
      })),
    }
    const source = instance.getSource(SOURCE) as GeoJSONSource | undefined
    if (source) source.setData(data)
    else {
      instance.addSource(SOURCE, { type: 'geojson', data })
      instance.addLayer({
        id: LAYER, type: 'circle', source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 6, 19, 9],
          'circle-color': ['case', ['get', 'inGround'], IN_GROUND, '#ffffff'],
          'circle-stroke-color': ['case', ['get', 'inGround'], '#ffffff', PLANNED],
          'circle-stroke-width': 2,
        },
      })
    }

    const bounds = points.reduce((b, p) => b.extend([p.lng, p.lat]), new maplibregl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat]))
    instance.fitBounds(bounds, { padding: 48, duration: 0, maxZoom: 18 })

    const byId = new Map(points.map((p) => [p.id, p]))
    const click = (e: MapLayerMouseEvent) => onPick(byId.get(Number(e.features?.[0]?.properties?.id)) ?? null)
    const enter = () => { instance.getCanvas().style.cursor = 'pointer' }
    const leave = () => { instance.getCanvas().style.cursor = '' }
    instance.on('click', LAYER, click)
    instance.on('mouseenter', LAYER, enter)
    instance.on('mouseleave', LAYER, leave)
    return () => {
      instance.off('click', LAYER, click)
      instance.off('mouseenter', LAYER, enter)
      instance.off('mouseleave', LAYER, leave)
    }
  }, [instance, points, onPick])

  return null
}
