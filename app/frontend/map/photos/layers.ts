import type { Feature, FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { MapPhotoData } from '@/types/soil_photos'

export const PHOTOS_SOURCE = 'photos'
export const PHOTO_LAYER_IDS = ['photos-cluster', 'photos-cluster-count', 'photos-halo', 'photos-heading', 'photos-point'] as const
export const PHOTO_POINT_LAYER = 'photos-point'
export const PHOTO_CLUSTER_LAYER = 'photos-cluster'

const PRUNE = '#5b5781'
const PRUNE_LIGHT = '#9189b8'

export type PhotoFeatureProperties = { id: number; heading: number | null; label: string }
export type PhotoFeatureCollection = FeatureCollection<Point, PhotoFeatureProperties>

/** GeoJSON of the placed photos. */
export function photosToGeoJSON(photos: MapPhotoData[]): PhotoFeatureCollection {
  const features: Feature<Point, PhotoFeatureProperties>[] = photos
    .filter((p) => p.lng != null && p.lat != null)
    .map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lng as number, p.lat as number] },
      properties: { id: p.id, heading: p.heading, label: p.caption ?? '' },
    }))
  return { type: 'FeatureCollection', features }
}

function canvasImage(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  draw(ctx, size)
  return ctx.getImageData(0, 0, size, size)
}

/** A camera in a white disc, drawn here (no image to fetch, no cross-origin read). */
function cameraIcon(): ImageData {
  return canvasImage(64, (ctx, s) => {
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 4
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, 24, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 3
    ctx.strokeStyle = PRUNE
    ctx.stroke()
    // body, bump and lens
    ctx.fillStyle = PRUNE
    ctx.beginPath()
    ctx.roundRect(17, 24, 30, 20, 4)
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect(26, 19, 12, 7, 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(32, 34, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PRUNE
    ctx.beginPath()
    ctx.arc(32, 34, 3, 0, Math.PI * 2)
    ctx.fill()
  })
}

/** A wedge pointing up (north), the view of the camera; rotated by the heading. */
function headingIcon(): ImageData {
  return canvasImage(256, (ctx, s) => {
    const c = s / 2
    const radius = c - 3
    const from = (-90 - 30) * (Math.PI / 180)
    const to = (-90 + 30) * (Math.PI / 180)
    const gradient = ctx.createRadialGradient(c, c, 8, c, c, radius)
    gradient.addColorStop(0, 'rgba(91,87,129,0.7)')
    gradient.addColorStop(1, 'rgba(91,87,129,0.12)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.arc(c, c, radius, from, to)
    ctx.closePath()
    ctx.fill()
    // crisp edges so the direction reads even on aerial photos
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(from) * 20, c + Math.sin(from) * 20)
    ctx.lineTo(c + Math.cos(from) * radius, c + Math.sin(from) * radius)
    ctx.arc(c, c, radius, from, to)
    ctx.lineTo(c + Math.cos(to) * 20, c + Math.sin(to) * 20)
    ctx.stroke()
  })
}

function addImages(map: MapLibreMap) {
  if (!map.hasImage('photo-camera')) map.addImage('photo-camera', cameraIcon(), { pixelRatio: 2 })
  if (!map.hasImage('photo-heading')) map.addImage('photo-heading', headingIcon(), { pixelRatio: 2 })
}

/** Keeps the photo layers above the drawn features (their order depends on who mounted first). */
function raise(map: MapLibreMap) {
  PHOTO_LAYER_IDS.forEach((id) => map.getLayer(id) && map.moveLayer(id))
}

/**
 * Installs (once) the photo markers: camera icons that cluster, a wedge
 * showing the viewing direction when the photo has a heading, a halo on the
 * open photo. Idempotent: later calls only update the data.
 */
export function installPhotoLayers(map: MapLibreMap, data: PhotoFeatureCollection) {
  const source = map.getSource(PHOTOS_SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    raise(map)
    return
  }
  addImages(map)
  map.addSource(PHOTOS_SOURCE, { type: 'geojson', data, cluster: true, clusterRadius: 44, clusterMaxZoom: 18 })
  const single = ['!', ['has', 'point_count']] as never
  map.addLayer({
    id: 'photos-cluster', type: 'circle', source: PHOTOS_SOURCE, filter: ['has', 'point_count'],
    paint: {
      'circle-color': PRUNE,
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'photos-cluster-count', type: 'symbol', source: PHOTOS_SOURCE, filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  })
  map.addLayer({
    id: 'photos-halo', type: 'circle', source: PHOTOS_SOURCE, filter: ['==', ['get', 'id'], -1],
    paint: { 'circle-radius': 22, 'circle-color': PRUNE_LIGHT, 'circle-opacity': 0.45, 'circle-stroke-color': PRUNE, 'circle-stroke-width': 2 },
  })
  map.addLayer({
    id: 'photos-heading', type: 'symbol', source: PHOTOS_SOURCE,
    filter: ['all', single, ['==', ['typeof', ['get', 'heading']], 'number']],
    layout: {
      'icon-image': 'photo-heading', 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.45, 19, 1],
    },
  })
  map.addLayer({
    id: 'photos-point', type: 'symbol', source: PHOTOS_SOURCE, filter: single,
    layout: {
      'icon-image': 'photo-camera', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 20, 0.85],
    },
  })
  raise(map)
}

export function setPhotoLayersVisible(map: MapLibreMap, visible: boolean) {
  PHOTO_LAYER_IDS.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'))
}

/** Highlights one photo (or none). */
export function highlightPhoto(map: MapLibreMap, id: number | null) {
  if (map.getLayer('photos-halo')) map.setFilter('photos-halo', ['==', ['get', 'id'], id ?? -1])
}

export function removePhotoLayers(map: MapLibreMap) {
  PHOTO_LAYER_IDS.forEach((id) => map.getLayer(id) && map.removeLayer(id))
  if (map.getSource(PHOTOS_SOURCE)) map.removeSource(PHOTOS_SOURCE)
}
