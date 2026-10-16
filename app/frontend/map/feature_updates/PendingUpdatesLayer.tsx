import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { useFeatureUpdates } from '@/map/feature_updates/store'
import { FEATURES_SOURCE } from '@/map/layers/features'

const POINT_LAYER = 'pending-updates-point'
const LINE_LAYER = 'pending-updates-line'
const COLOR = '#c97f05' // humus-500
const PENDING = ['boolean', ['feature-state', 'pendingUpdate'], false]

function install(map: MapLibreMap) {
  if (!map.getSource(FEATURES_SOURCE)) return false
  if (!map.getLayer(POINT_LAYER)) {
    map.addLayer({
      id: POINT_LAYER,
      type: 'circle',
      source: FEATURES_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 9, 19, 16],
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-stroke-color': COLOR,
        'circle-stroke-width': 2.5,
        'circle-stroke-opacity': ['case', PENDING as never, 1, 0],
      },
    })
  }
  if (!map.getLayer(LINE_LAYER)) {
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: FEATURES_SOURCE,
      filter: ['!=', ['geometry-type'], 'Point'],
      paint: {
        'line-color': COLOR,
        'line-width': 3,
        'line-dasharray': [1.5, 1.5],
        'line-opacity': ['case', PENDING as never, 1, 0],
      },
    })
  }
  return true
}

/**
 * Overlay without UI: a dashed amber ring around every element an AI
 * proposed to change, until a person reviews the change.
 */
export default function PendingUpdatesLayer() {
  const editor = useEditor()
  const map = editor.instance
  const { updates } = useFeatureUpdates()
  const ids = useMemo(() => updates.map((u) => u.featureId), [updates])
  const marked = useRef<number[]>([])

  useEffect(() => {
    const ensure = () => {
      try {
        install(map)
      } catch {
        /* style not ready yet: the next styledata brings us back */
      }
    }
    ensure()
    map.on('styledata', ensure)
    return () => {
      map.off('styledata', ensure)
    }
  }, [map])

  // Feature states live on the features source: set them again when it changes.
  useEffect(() => {
    if (!map.getSource(FEATURES_SOURCE)) return
    for (const id of marked.current) if (!ids.includes(id)) map.setFeatureState({ source: FEATURES_SOURCE, id }, { pendingUpdate: false })
    for (const id of ids) map.setFeatureState({ source: FEATURES_SOURCE, id }, { pendingUpdate: true })
    marked.current = ids
  }, [map, ids, editor.features])

  return null
}
