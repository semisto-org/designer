import { featureCollection, polygon, union } from '@turf/turf'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import { strataKey } from '@/map/drawing/hidden'
import { useDrawingState } from '@/map/drawing/store'
import { useEditor } from '@/map/editor/EditorContext'
import { isPlant } from '@/map/plants/properties'
import { usePlanting } from '@/map/plants/store'
import { plantStrata } from '@/map/plants/strata'
import { crownShadow } from '@/map/time/growth'
import { inMoment } from '@/map/time/moment'
import { growingPlant, sizeAtMoment } from '@/map/time/plants'

const SOURCE = 'time-shade'
const FILL = `${SOURCE}-fill`
const LINE = `${SOURCE}-line`
// design-lint-ok: MapLibre paint takes colour values (prune-700, the notebook's ink wash)
const SHADE_COLOR = '#4a4668'
/** Past this many shadows, they are drawn one by one instead of merged (merging costs more than it shows). */
const MERGE_LIMIT = 400

type Shadows = FeatureCollection<Polygon | MultiPolygon>

/** One wash of shade: overlapping shadows merged, so where two trees shade the same ground it is not darker. */
function merged(rings: [number, number][][]): Shadows {
  const polygons = rings.map((ring) => polygon([ring]))
  if (polygons.length < 2 || polygons.length > MERGE_LIMIT) return featureCollection(polygons)
  try {
    const one = union(featureCollection(polygons))
    return featureCollection(one ? [one as Feature<Polygon | MultiPolygon>] : polygons)
  } catch {
    return featureCollection(polygons)
  }
}

function install(map: MapLibreMap, data: Shadows) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  // Under the crowns (and every other feature), over the base map and the region's layers.
  const before = ['plant-crowns-reach', 'plant-crowns-fill', 'features-fill', 'features-line'].find((id) => map.getLayer(id))
  map.addSource(SOURCE, { type: 'geojson', data })
  map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': SHADE_COLOR, 'fill-opacity': 0.28 } }, before)
  map.addLayer({ id: LINE, type: 'line', source: SOURCE, paint: { 'line-color': SHADE_COLOR, 'line-opacity': 0.45, 'line-width': 1, 'line-dasharray': ['literal', [3, 2]] } }, before)
}

function safeInstall(map: MapLibreMap, data: Shadows) {
  try {
    install(map, data)
  } catch {
    // A style being swapped refuses sources until it loaded: its `styledata` brings us back.
  }
}

/**
 * The noon shade of the time strip (map/time): under each crown, the shadow
 * it casts at solar noon on 21 June or 21 December, at the size the plant
 * has at the moment shown. Nothing while no season is picked.
 */
export default function ShadeOverlay() {
  const editor = useEditor()
  const map = editor.instance
  const { data } = usePlanting(editor.map.id)
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const hiddenStrata = useDrawingState((s) => s.hiddenStrata)
  const { features, moment, timeline, shade } = editor

  const shadows = useMemo<Shadows>(() => {
    if (!shade || hidden.includes('plants')) return featureCollection([])
    const rings: [number, number][][] = []
    for (const feature of features) {
      if (!isPlant(feature) || feature.geometry.type !== 'Point' || feature.properties.status === 'rejected') continue
      if (!inMoment(feature.properties, moment, timeline.arrival)) continue
      const strata = plantStrata(feature, data)
      if (!strata || hiddenStrata.includes(strataKey(strata))) continue
      const plant = growingPlant(feature, data, strata)
      const size = sizeAtMoment(feature, plant, moment, timeline)
      if (!plant || !size) continue
      const ring = crownShadow(feature.geometry.coordinates as [number, number], plant, size, shade)
      if (ring) rings.push(ring)
    }
    return merged(rings)
  }, [features, moment, timeline, shade, data, hidden, hiddenStrata])

  const latest = useRef(shadows)
  latest.current = shadows
  useEffect(() => {
    const apply = () => safeInstall(map, latest.current)
    apply()
    map.on('styledata', apply)
    return () => {
      map.off('styledata', apply)
    }
  }, [map])
  useEffect(() => safeInstall(map, shadows), [map, shadows])
  useEffect(() => () => {
    try {
      for (const id of [LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    } catch {
      // The map is already gone.
    }
  }, [map])

  return null
}
