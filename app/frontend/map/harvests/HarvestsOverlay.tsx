import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { STATUS_COLORS } from '@/map/harvests/shared'
import { useHarvests } from '@/map/harvests/store'

const SOURCE = 'harvest-rings'
const LAYER = 'harvest-rings'

type RingProps = { featureId: number; color: string; dashed: boolean }

// The rings each map shows, so a `styledata` event does not resend them.
const installed = new WeakMap<MapLibreMap, FeatureCollection<Point, RingProps>>()

function install(map: MapLibreMap, data: FeatureCollection<Point, RingProps>) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (!source) map.addSource(SOURCE, { type: 'geojson', data })
  else if (installed.get(map) !== data) source.setData(data)
  installed.set(map, data)
  if (!map.getLayer(LAYER)) {
    map.addLayer({
      id: LAYER, type: 'circle', source: SOURCE,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 7, 20, 15],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': ['case', ['get', 'dashed'], 1.5, 3.5],
        'circle-stroke-opacity': ['case', ['get', 'dashed'], 0.7, 0.95],
      },
    })
  } else {
    // Over the plant crowns and number pastilles, which may install later.
    const layers = map.getStyle().layers
    if (layers[layers.length - 1]?.id !== LAYER) map.moveLayer(LAYER)
  }
}

// A style being swapped refuses sources until it loaded; `styledata` brings us back.
function safeInstall(map: MapLibreMap, data: FeatureCollection<Point, RingProps>) {
  try {
    install(map, data)
  } catch {
    /* style not ready yet */
  }
}

function remove(map: MapLibreMap) {
  if (!map.getStyle()) return
  if (map.getLayer(LAYER)) map.removeLayer(LAYER)
  if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  installed.delete(map)
}

/**
 * While « Récoltes » is open, rings every fruit plant on the map in the
 * colour of the season shown: picked, fruit on the tree, nothing, not noted.
 */
export default function HarvestsOverlay() {
  const { instance: map, map: current, activePanel, features } = useEditor()
  const { log, mapId } = useHarvests()
  const shown = activePanel === 'harvests' && mapId === current.id ? log : null

  const data = useMemo<FeatureCollection<Point, RingProps> | null>(() => {
    if (!shown) return null
    const points = new Map(features.filter((f) => f.geometry.type === 'Point').map((f) => [f.properties.id, f.geometry as Point]))
    return {
      type: 'FeatureCollection',
      features: shown.plants.flatMap((row) => {
        const geometry = points.get(row.featureId)
        if (!geometry) return []
        const status = (row.seasons[String(shown.season)]?.status ?? 'unnoted') as keyof typeof STATUS_COLORS
        return [{ type: 'Feature' as const, geometry, properties: { featureId: row.featureId, color: STATUS_COLORS[status], dashed: status === 'unnoted' } }]
      }),
    }
  }, [shown, features])

  useEffect(() => {
    if (!data) { remove(map); return }
    const apply = () => safeInstall(map, data)
    apply()
    // A new base style drops custom layers, and other overlays add theirs on top: put the rings back.
    map.on('styledata', apply)
    return () => { map.off('styledata', apply) }
  }, [map, data])

  useEffect(() => () => remove(map), [map])
  return null
}
