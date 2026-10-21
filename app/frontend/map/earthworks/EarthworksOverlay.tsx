import { pointOnFeature } from '@turf/turf'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo } from 'react'
import { useDrawingState } from '@/map/drawing/store'
import { useEditor } from '@/map/editor/EditorContext'
import { arrowsToGeoJSON, type ArrowInput } from '@/map/earthworks/arrows'
import { SOIL_PARTS } from '@/map/earthworks/earthworks'
import { m3, useArrowsShown, useEarthworks } from '@/map/earthworks/model'
import { displayGeometry } from '@/map/zones/zones'
import type { MapFeature } from '@/types'

const SOURCE = 'earthworks-arrows'
const LAYERS = ['earthworks-arrows-line', 'earthworks-arrows-head', 'earthworks-arrows-label'] as const
const HEAD_IMAGE = 'earthworks-arrow-head'
const EARTH = '#8b5e3c'
const PIXEL_RATIO = 2

/** A small filled triangle pointing up (north), rotated by the layer to each arrow's bearing. */
function headImage(): { width: number; height: number; data: Uint8ClampedArray } | null {
  const size = 28
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = EARTH
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(size / 2, 3)
  ctx.lineTo(size - 4, size - 4)
  ctx.lineTo(size / 2, size - 9)
  ctx.lineTo(4, size - 4)
  ctx.closePath()
  ctx.stroke()
  ctx.fill()
  return { width: size, height: size, data: ctx.getImageData(0, 0, size, size).data }
}

function ensureImage(map: MapLibreMap) {
  if (map.hasImage(HEAD_IMAGE)) return
  const image = headImage()
  if (image) map.addImage(HEAD_IMAGE, image, { pixelRatio: PIXEL_RATIO })
}

/** Installs the source and layers once (again after a basemap swap), then only sets the data. */
function install(map: MapLibreMap, data: ReturnType<typeof arrowsToGeoJSON>) {
  ensureImage(map)
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    LAYERS.forEach((id) => map.getLayer(id) && map.moveLayer(id))
    return
  }
  map.addSource(SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: LAYERS[0], type: 'line', source: SOURCE, filter: ['==', ['get', 'role'], 'line'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': EARTH, 'line-width': 2.5, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: LAYERS[1], type: 'symbol', source: SOURCE, filter: ['==', ['get', 'role'], 'head'],
    layout: {
      'icon-image': HEAD_IMAGE, 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
  })
  map.addLayer({
    id: LAYERS[2], type: 'symbol', source: SOURCE, filter: ['==', ['get', 'role'], 'label'], minzoom: 16,
    layout: { 'text-field': ['get', 'label'], 'text-size': 13, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false },
    paint: { 'text-color': '#4a3020', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  })
}

function anchor(feature: MapFeature): [number, number] {
  return pointOnFeature({ type: 'Feature', geometry: displayGeometry(feature), properties: {} }).geometry.coordinates as [number, number]
}

/**
 * Always mounted in the editor: draws where the soil of each hole goes,
 * from the hole to the mound, bed or zone of the map that receives it.
 * Hidden in « Situation actuelle » (it is a project), with the layers of
 * either end, or when the person turns it off in the « Terres » panel.
 */
export default function EarthworksOverlay() {
  const editor = useEditor()
  const map = editor.instance
  const { balance, byId } = useEarthworks()
  const shown = useArrowsShown()
  // The land on arrival has no earthworks yet: no arrows.
  const arrival = editor.moment === 'arrival'
  const hiddenLayers = useDrawingState((s) => s.hiddenLayers)

  const data = useMemo(() => {
    if (!shown || arrival) return arrowsToGeoJSON([])
    const arrows: ArrowInput[] = []
    for (const dig of balance.digs) {
      const from = byId.get(dig.id)
      if (!from || hiddenLayers.includes(from.properties.layer)) continue
      const volumes = new Map<number, number>()
      for (const part of SOIL_PARTS) {
        const to = dig.to[part]
        if (typeof to === 'number') volumes.set(to, (volumes.get(to) ?? 0) + dig.excavation[part])
      }
      for (const [id, volume] of volumes) {
        const target = byId.get(id)
        if (!target || hiddenLayers.includes(target.properties.layer)) continue
        arrows.push({ from: anchor(from), to: anchor(target), volume, label: m3(volume) })
      }
    }
    return arrowsToGeoJSON(arrows)
  }, [balance, byId, shown, arrival, hiddenLayers])

  useEffect(() => {
    // After the editor's own layers, so the arrows sit on top of the shapes.
    const timer = window.setTimeout(() => install(map, data), 0)
    const reinstall = () => { if (!map.getSource(SOURCE)) install(map, data) }
    map.on('styledata', reinstall)
    return () => {
      window.clearTimeout(timer)
      map.off('styledata', reinstall)
    }
  }, [map, data])

  useEffect(() => () => {
    LAYERS.forEach((id) => map.getLayer(id) && map.removeLayer(id))
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }, [map])

  return null
}
