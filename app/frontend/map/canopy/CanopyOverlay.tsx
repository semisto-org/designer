import type { ImageSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import { t } from '@/lib/i18n'
import { CanopyLegend, CanopyStrip } from '@/map/canopy/CanopyLegend'
import { canopyBeforeId, decodeGrid, gridCorners, paintHeights } from '@/map/canopy/ramp'
import { canopyActions, useCanopy, type CanopyReport } from '@/map/canopy/store'
import { useEditor } from '@/map/editor/EditorContext'

const SOURCE = 'canopy-height'
const LAYER = 'canopy-height'

/** The grid as a PNG data URL, painted on a canvas with the height ramp. */
function gridImage(report: Extract<CanopyReport, { available: true }>): string | null {
  const { width, height, data } = report.grid
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context || width === 0 || height === 0) return null
  const pixels = paintHeights(decodeGrid(data), width, height)
  const image = context.createImageData(width, height)
  image.data.set(pixels)
  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Adds or updates the image source and its raster layer (idempotent), under the outline and the drawing. */
function installCanopy(map: MapLibreMap, url: string, report: Extract<CanopyReport, { available: true }>) {
  const coordinates = gridCorners(report.grid.bounds)
  const source = map.getSource(SOURCE) as ImageSource | undefined
  if (!source) {
    map.addSource(SOURCE, { type: 'image', url, coordinates })
  } else {
    source.updateImage({ url, coordinates })
  }
  if (!map.getLayer(LAYER)) {
    map.addLayer({ id: LAYER, type: 'raster', source: SOURCE, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } }, canopyBeforeId(map.getLayersOrder(), LAYER))
  }
}

function placeCanopy(map: MapLibreMap) {
  if (!map.getLayer(LAYER)) return
  const order = map.getLayersOrder()
  const before = canopyBeforeId(order, LAYER)
  if (!before) return
  // Already under the first layer that must stay above: nothing to do.
  if (order.indexOf(LAYER) < order.indexOf(before)) return
  map.moveLayer(LAYER, before)
}

function removeCanopy(map: MapLibreMap) {
  if (!map.getStyle()) return
  if (map.getLayer(LAYER)) map.removeLayer(LAYER)
  if (map.getSource(SOURCE)) map.removeSource(SOURCE)
}

/**
 * Paints the height of the trees on the map when « Voir la hauteur des
 * arbres sur la carte » is on, with a small legend. Loads the report itself
 * if the panel has not.
 */
export default function CanopyOverlay() {
  const { instance: map, map: current, activePanel } = useEditor()
  const { mapId, report, showOnMap } = useCanopy()
  const version = current.bbox?.join(',') ?? ''

  useEffect(() => {
    if (showOnMap && mapId === current.id) canopyActions.load(current.id, version)
  }, [showOnMap, mapId, current.id, version])

  const ready = showOnMap && mapId === current.id && report?.available ? report : null
  const url = useMemo(() => (ready ? gridImage(ready) : null), [ready])

  useEffect(() => {
    if (!ready || !url) {
      removeCanopy(map)
      return
    }
    installCanopy(map, url, ready)
    placeCanopy(map)
  }, [map, ready, url])

  // Overlays and base maps come and go: stay under the outline and the drawing.
  const shown = useRef(false)
  shown.current = ready != null
  useEffect(() => {
    const place = () => { if (shown.current) placeCanopy(map) }
    map.on('styledata', place)
    return () => { map.off('styledata', place) }
  }, [map])

  useEffect(() => () => removeCanopy(map), [map])

  // The panel has its own legend.
  if (!ready || activePanel === 'canopy') return null
  return (
    <>
      <div className="pointer-events-none absolute right-16 top-3 z-10 hidden rounded-lg bg-white/90 px-2.5 py-2 text-[11px] text-loam-700 shadow-sm backdrop-blur md:block">
        <p className="mb-1 font-medium text-loam-800">{t('canopy.legend.title')}</p>
        <CanopyLegend compact />
        <p className="mt-1.5 max-w-36 text-[10px] leading-tight text-loam-500">{t('canopy.legend.source')}</p>
      </div>
      <div className="pointer-events-none absolute bottom-[5.5rem] right-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[10px] text-loam-700 shadow-sm backdrop-blur md:hidden">
        <CanopyStrip />
      </div>
    </>
  )
}
