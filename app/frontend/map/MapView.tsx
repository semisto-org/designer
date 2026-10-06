import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { t } from '@/lib/i18n'
import { MapContext } from '@/map/MapContext'

// MapLibre locates its worker next to its own module, which a bundler moves:
// point it at the worker Vite builds.
maplibregl.setWorkerUrl(workerUrl)
import type { BBox, LngLat } from '@/types'

// Neutral fallback base until the region's base layers are added on top.
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#ede9e3' } },
    { id: 'osm', type: 'raster', source: 'osm' },
  ],
}

type Props = {
  center?: LngLat | null
  zoom?: number | null
  bbox?: BBox | null
  style?: StyleSpecification | string
  className?: string
  children?: ReactNode
  onReady?: (map: MapLibreMap) => void
  /** Where the scale bar sits (the editor keeps the bottom left for its guide card). */
  scalePosition?: 'bottom-left' | 'bottom-right'
}

export function MapView({ center, zoom, bbox, style, className, children, onReady, scalePosition = 'bottom-left' }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)

  useEffect(() => {
    if (!container.current) return
    const instance = new maplibregl.Map({
      container: container.current,
      style: style ?? FALLBACK_STYLE,
      center: center ?? [4.87, 50.47],
      zoom: zoom ?? 8,
      maxZoom: 22,
      attributionControl: { compact: true },
      // Needed to export the canvas (scaled PDF, thumbnails).
      canvasContextAttributes: { preserveDrawingBuffer: true },
      locale: {
        'NavigationControl.ZoomIn': t('editor.controls.zoom_in'),
        'NavigationControl.ZoomOut': t('editor.controls.zoom_out'),
        'NavigationControl.ResetBearing': t('editor.controls.north'),
        'GeolocateControl.FindMyLocation': t('editor.controls.locate'),
        'AttributionControl.ToggleAttribution': t('editor.controls.sources'),
      },
    })
    instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    instance.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), scalePosition)
    instance.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      'top-right',
    )
    // 'style.load', not 'load': 'load' waits for the first tiles, so a slow
    // tile server would hold back the whole editor (and its own base maps).
    instance.once('style.load', () => {
      if (bbox) instance.fitBounds(bbox as [number, number, number, number], { padding: 60, duration: 0, maxZoom: 19 })
      setMap(instance)
      onReady?.(instance)
    })
    return () => {
      setMap(null)
      instance.remove()
    }
    // The map is created once; props are initial values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={className ?? 'relative h-full w-full'}>
      <div ref={container} className="h-full w-full" />
      <MapContext.Provider value={map}>{map && children}</MapContext.Provider>
    </div>
  )
}
