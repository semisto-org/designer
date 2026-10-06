import type { ImageSource, Map as MapLibreMap } from 'maplibre-gl'
import { aerialViewIdOf } from '@/drone/placement'
import { regionKeyOfSource } from '@/map/layers/region'
import { corners, planImageIdOf, planImageLayerId, planImagesMove } from '@/map/plan_images/pose'
import type { PlanImage } from '@/map/plan_images/store'

// Plan images on the map: one image source and raster layer per image
// (stable id `plan-image-<id>`), right above the base map and the drone
// view, under the region's data overlays and the drawing. Installing is
// idempotent; a hidden image keeps its layer, so showing it again is instant.

// MapView's own neutral style, under everything.
const MAPVIEW_LAYERS = new Set(['background', 'osm'])

/** Brings the map in line with the list: poses, opacity, visibility; removes images that are gone. */
export function syncPlanImages(map: MapLibreMap, images: PlanImage[]) {
  const known = new Set(images.map((image) => image.id))
  map.getLayersOrder().forEach((id) => {
    const existing = planImageIdOf(id)
    if (existing == null || known.has(existing)) return
    map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  })

  images.forEach((image) => {
    const id = planImageLayerId(image.id)
    const coordinates = corners(image)
    const source = map.getSource(id) as ImageSource | undefined
    if (!source) {
      map.addSource(id, { type: 'image', url: image.imageUrl, coordinates })
    } else if (JSON.stringify(source.coordinates) !== JSON.stringify(coordinates)) {
      source.setCoordinates(coordinates)
    }
    if (!map.getLayer(id)) {
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': image.opacity, 'raster-fade-duration': 0 } })
    }
    map.setLayoutProperty(id, 'visibility', image.visible ? 'visible' : 'none')
    map.setPaintProperty(id, 'raster-opacity', image.opacity)
  })
}

/**
 * Keeps the plan images right above the base map and the drone views, in
 * their order (the last one on top), whatever was added since. Moves
 * nothing when the order is already right: safe on every `styledata`.
 */
export function placePlanImages(map: MapLibreMap, images: PlanImage[], layers: { key: string; category: string }[]) {
  const bases = new Set(layers.filter((l) => l.category === 'base').map((l) => l.key))
  const isFloor = (id: string) => {
    const key = regionKeyOfSource(id)
    return MAPVIEW_LAYERS.has(id) || aerialViewIdOf(id) != null || (key != null && bases.has(key))
  }
  const wanted = [...images].sort((a, b) => a.position - b.position || a.id - b.id).map((image) => planImageLayerId(image.id))
  const move = planImagesMove(map.getLayersOrder(), wanted, isFloor)
  if (!move) return
  wanted.filter((id) => map.getLayer(id)).forEach((id) => map.moveLayer(id, move.before))
}
