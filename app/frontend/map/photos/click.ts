import type { Map as MapLibreMap, PointLike } from 'maplibre-gl'

/** Markers of drawn elements a photo can sit on (a tap, a tree); areas are left out. */
export const ELEMENT_MARKER_LAYERS = ['features-point', 'features-line']

/**
 * What a click on a photo marker does. Alone, it opens the photo. On top of
 * a drawn element (a photo of the tap, taken at the tap), the editor selects
 * the element and the photo is offered next to it, so neither hides the other.
 */
export function photoClickAction(map: Pick<MapLibreMap, 'getLayer' | 'queryRenderedFeatures'>, point: PointLike): 'open' | 'offer' {
  const layers = ELEMENT_MARKER_LAYERS.filter((id) => map.getLayer(id))
  if (layers.length === 0) return 'open'
  return map.queryRenderedFeatures(point, { layers }).length > 0 ? 'offer' : 'open'
}

/**
 * Past this zoom, a group's photos sit within a few metres of each other
 * (often taken from the same spot): zooming further would not help, so a
 * click opens them instead.
 */
export const GROUP_OPEN_ZOOM = 20

/** What a click on a group of photos does: zoom until it splits, or open its photos when they share a spot. */
export function clusterClickAction(expansionZoom: number, currentZoom: number): 'zoom' | 'open' {
  if (expansionZoom > GROUP_OPEN_ZOOM) return 'open'
  return expansionZoom <= currentZoom ? 'open' : 'zoom'
}
