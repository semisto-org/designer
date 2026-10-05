import { circle } from '@turf/turf'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { useDrawingState } from '@/map/drawing/store'
import { gpsAccuracy, gpsToCheck } from '@/map/gps/accuracy'
import type { Feature, FeatureCollection, Polygon } from 'geojson'

const SOURCE = 'gps-accuracy'
const FILL = 'gps-accuracy-fill'
const LINE = 'gps-accuracy-line'
// Humus (attention), from the design tokens.
const COLOR = '#b8851a'

function install(map: MapLibreMap, data: FeatureCollection) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) source.setData(data)
  else map.addSource(SOURCE, { type: 'geojson', data })
  // Under the features, so the points stay on top and clickable.
  const before = map.getLayer('features-fill') ? 'features-fill' : undefined
  if (!map.getLayer(FILL)) map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': COLOR, 'fill-opacity': 0.08 } }, before)
  if (!map.getLayer(LINE)) {
    map.addLayer({ id: LINE, type: 'line', source: SOURCE, paint: { 'line-color': COLOR, 'line-width': 1.5, 'line-dasharray': [2, 2] } }, before)
  }
}

/**
 * Around each point placed with an imprecise phone GPS fix and not checked
 * yet: a dashed circle as wide as the fix's accuracy, where the real spot
 * probably is. Renders nothing else.
 */
export default function GpsAccuracyOverlay() {
  const { instance, features } = useEditor()
  const hidden = useDrawingState((s) => s.hiddenLayers)

  const data = useMemo<FeatureCollection<Polygon>>(() => ({
    type: 'FeatureCollection',
    features: features.flatMap((f): Feature<Polygon>[] => {
      if (f.geometry.type !== 'Point' || hidden.includes(f.properties.layer) || !gpsToCheck(f.properties)) return []
      return [circle(f.geometry.coordinates, gpsAccuracy(f.properties)!, { units: 'meters', steps: 48, properties: { id: f.properties.id } })]
    }),
  }), [features, hidden])

  useEffect(() => {
    const ensure = () => install(instance, data)
    ensure()
    instance.on('styledata', ensure)
    return () => {
      instance.off('styledata', ensure)
    }
  }, [instance, data])

  return null
}
