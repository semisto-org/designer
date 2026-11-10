import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { useCallback, useEffect, useRef } from 'react'
import type { MapFeature } from '@/types'

const SOURCE = 'function-highlight'
const HALO = 'function-highlight-halo'
const LINE = 'function-highlight-line'
const POINT_HALO = 'function-highlight-point-halo'
const POINT = 'function-highlight-point'
const LAYERS = [HALO, LINE, POINT_HALO, POINT]
// humus-400 (mangue) over a white halo: it reads on an aerial photo, dark
// woods as well as pale fields.
const COLOR = '#ef9b0d'
// Three slow breaths, like a lantern waved at dusk, then a steady ring.
const PULSES = 3
const PULSE_MS = 900

const EMPTY = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection

function install(map: MapLibreMap, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
  } else {
    map.addSource(SOURCE, { type: 'geojson', data })
  }
  const notPoint = ['!=', ['geometry-type'], 'Point'] as never
  const point = ['==', ['geometry-type'], 'Point'] as never
  if (!map.getLayer(HALO)) {
    map.addLayer({ id: HALO, type: 'line', source: SOURCE, filter: notPoint, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-blur': 2, 'line-opacity': 0.8 } })
  }
  if (!map.getLayer(LINE)) {
    map.addLayer({ id: LINE, type: 'line', source: SOURCE, filter: notPoint, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': COLOR, 'line-width': 4, 'line-opacity': 1 } })
  }
  // A ring around a plant or a point, wide enough to stand out from its crown.
  const radius = ['interpolate', ['linear'], ['zoom'], 15, 10, 20, 22] as never
  if (!map.getLayer(POINT_HALO)) {
    map.addLayer({ id: POINT_HALO, type: 'circle', source: SOURCE, filter: point, paint: { 'circle-radius': radius, 'circle-color': 'rgba(0, 0, 0, 0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 7, 'circle-stroke-opacity': 0.8, 'circle-blur': 0.1 } })
  }
  if (!map.getLayer(POINT)) {
    map.addLayer({ id: POINT, type: 'circle', source: SOURCE, filter: point, paint: { 'circle-radius': radius, 'circle-color': 'rgba(239, 155, 13, 0.18)', 'circle-stroke-color': COLOR, 'circle-stroke-width': 3, 'circle-stroke-opacity': 1 } })
  }
  // Over what is drawn, the point being to see these elements, but under the
  // names, so a ring never hides which element it is.
  const labels = ['features-label', 'zone-labels', 'zone-labels-line'].find((id) => map.getLayer(id))
  for (const id of LAYERS) map.moveLayer(id, labels)
}

function setOpacity(map: MapLibreMap, value: number) {
  if (!map.getLayer(LINE)) return
  map.setPaintProperty(LINE, 'line-opacity', value)
  map.setPaintProperty(HALO, 'line-opacity', 0.8 * value)
  map.setPaintProperty(POINT, 'circle-stroke-opacity', value)
  map.setPaintProperty(POINT_HALO, 'circle-stroke-opacity', 0.8 * value)
}

/**
 * Puts the elements serving a function forward on the map: an outline (or a
 * ring around a point) that breathes three times, then stays until another
 * function is shown or the panel closes. Without motion for people who ask
 * for reduced motion.
 */
export function useFeatureHighlight(map: MapLibreMap) {
  const data = useRef<GeoJSON.FeatureCollection>(EMPTY)
  const frame = useRef<number | null>(null)

  const stopPulse = () => {
    if (frame.current != null) cancelAnimationFrame(frame.current)
    frame.current = null
  }

  useEffect(() => {
    // A base map change drops our layers: put them back with what they showed.
    const ensure = () => {
      if (data.current.features.length === 0) return
      try {
        if (!map.getLayer(LINE)) install(map, data.current)
      } catch {
        /* style not ready yet: the next styledata brings us back */
      }
    }
    map.on('styledata', ensure)
    return () => {
      map.off('styledata', ensure)
      stopPulse()
      try {
        for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(SOURCE)) map.removeSource(SOURCE)
      } catch {
        /* the map is already gone */
      }
    }
  }, [map])

  const show = useCallback((features: MapFeature[]) => {
    stopPulse()
    data.current = { type: 'FeatureCollection', features: features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: {} })) } as GeoJSON.FeatureCollection
    try {
      install(map, data.current)
    } catch {
      return
    }
    setOpacity(map, 1)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      if (elapsed >= PULSES * PULSE_MS) {
        setOpacity(map, 1)
        frame.current = null
        return
      }
      // From full to faint and back, smoothly.
      setOpacity(map, 0.6 + 0.4 * Math.cos((elapsed / PULSE_MS) * 2 * Math.PI))
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [map])

  const clear = useCallback(() => {
    stopPulse()
    data.current = EMPTY
    const source = map.getSource(SOURCE) as GeoJSONSource | undefined
    source?.setData(EMPTY)
  }, [map])

  return { show, clear }
}
