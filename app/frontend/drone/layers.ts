import type { Map as MapLibreMap, RasterSourceSpecification } from 'maplibre-gl'
import { t } from '@/lib/i18n'
import { regionKeyOfSource } from '@/map/layers/region'
import { aerialLayerId, aerialMove, aerialViewIdOf } from '@/drone/placement'
import { ensurePmtilesProtocol } from '@/drone/pmtiles'
import type { RegionLayerData } from '@/types'
import type { AerialView } from '@/types/drone'

// Drone views on the map: one raster source and layer per view (stable id
// `aerial-view-<id>`), drawn right above the region's base map and under
// its data overlays, the terrain outline and the drawing. Installing is
// idempotent and switching a view off only hides it, so comparing two
// dates is instant. The tiles come straight from where Semisto hosts them.

// MapView's own neutral style, under everything.
const MAPVIEW_LAYERS = new Set(['background', 'osm'])

export function aerialSource(view: AerialView): RasterSourceSpecification {
  const attribution = view.attribution || t('drone.attribution_default')
  // An archive knows its zoom levels and bounds (read from its header):
  // only override them when staff said so.
  const zooms = {
    ...(view.minZoom != null ? { minzoom: view.minZoom } : {}),
    ...(view.maxZoom != null ? { maxzoom: view.maxZoom } : {}),
  }
  if (view.kind === 'pmtiles') {
    ensurePmtilesProtocol()
    return { type: 'raster', url: `pmtiles://${view.url}`, tileSize: 256, attribution, ...zooms }
  }
  return { type: 'raster', tiles: [view.url], tileSize: 256, attribution, ...zooms }
}

/**
 * Brings the map in line with the choice: the chosen view shown at
 * `opacity`, the others hidden, views that no longer exist removed.
 */
export function syncAerialViews(map: MapLibreMap, views: AerialView[], viewId: number | null, opacity: number) {
  const known = new Set(views.map((v) => v.id))
  map.getLayersOrder().forEach((id) => {
    const existing = aerialViewIdOf(id)
    if (existing == null || known.has(existing)) return
    map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  })

  views.forEach((view) => {
    const id = aerialLayerId(view.id)
    const shown = view.id === viewId
    if (!map.getLayer(id)) {
      if (!shown) return
      if (!map.getSource(id)) map.addSource(id, aerialSource(view))
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 150 } })
    }
    map.setLayoutProperty(id, 'visibility', shown ? 'visible' : 'none')
    if (shown) map.setPaintProperty(id, 'raster-opacity', opacity)
  })
}

/**
 * Keeps the drone views right above the topmost region base layer (or
 * above MapView's fallback when no base is installed), whatever was added
 * since: a base map installed later, an overlay, the drawing. Moves
 * nothing when the order is already right, so it is safe to call on
 * every `styledata` event.
 */
export function placeAerialLayers(map: MapLibreMap, regionLayers: RegionLayerData[]) {
  const bases = new Set(regionLayers.filter((l) => l.category === 'base').map((l) => l.key))
  const isFloor = (id: string) => {
    const key = regionKeyOfSource(id)
    return MAPVIEW_LAYERS.has(id) || (key != null && bases.has(key))
  }
  const order = map.getLayersOrder()
  const move = aerialMove(order, isFloor)
  if (!move) return
  order.filter((id) => aerialViewIdOf(id) != null).forEach((id) => map.moveLayer(id, move.before))
}
