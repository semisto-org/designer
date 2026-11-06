import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'

/**
 * « Étiquettes » hidden (« Calques »): the names written on the map (plants,
 * zones, ponds, buildings…) step aside, and each one comes back only while
 * the pointer is over its element, or while it is selected (a phone has no
 * pointer to hover with).
 *
 * The name layers are not refiltered on every move: they are hidden, and a
 * twin of each (`<id>-hover`), with the same look, draws the names of the
 * elements under the pointer or selected, and nothing else. The twins are
 * not in the pick layers (map/featurePick), so a name never shown can never
 * be clicked.
 */

/** The layers that write names on the map: other features, zones, lines, plants. */
export const NAME_LAYERS = ['features-label', 'zone-labels', 'zone-labels-line', 'plant-labels-text'] as const
export type NameLayer = (typeof NAME_LAYERS)[number]

/** The plants overlay sets its own name layer's visibility (map/plants/visibility). */
export const PLANT_NAME_LAYER: NameLayer = 'plant-labels-text'

export const hoverLayerId = (id: string) => `${id}-hover`

/** Names come back from a little further out than they do on their own. */
export const HOVER_MIN_ZOOM = 14

/** Only the elements under the pointer or selected (plants carry their element's id as `featureId`). */
export function shownTest(layer: string, ids: number[]): unknown {
  const key = layer === PLANT_NAME_LAYER ? 'featureId' : 'id'
  return ['in', ['get', key], ['literal', ids]]
}

/**
 * The twin's filter: what the layer names at all (`base`), for the shown
 * elements only. A plant's name ignores its usual zoom by crown size: one
 * asked for it.
 */
export function hoverFilter(layer: string, ids: number[], base: unknown): unknown {
  const test = shownTest(layer, ids)
  return base == null || layer === PLANT_NAME_LAYER ? test : ['all', base, test]
}

/** The twin of a name layer: same look, always placed, from further out. */
export function hoverLayerSpec(spec: LayerSpecification, ids: number[], base: unknown): LayerSpecification {
  const original = spec as LayerSpecification & { layout?: Record<string, unknown>; minzoom?: number }
  return {
    ...original,
    id: hoverLayerId(spec.id),
    minzoom: Math.min(original.minzoom ?? HOVER_MIN_ZOOM, HOVER_MIN_ZOOM),
    filter: hoverFilter(spec.id, ids, base),
    layout: { ...(original.layout ?? {}), visibility: 'visible', 'text-allow-overlap': true, 'icon-allow-overlap': true },
  } as LayerSpecification
}

type Visibility = Pick<MapLibreMap, 'getLayer' | 'getLayoutProperty' | 'setLayoutProperty'>

/**
 * Hides or shows the name layers drawn from the features source; the plants'
 * names follow `applyPlantsVisibility`. Leaves a layer alone when it already
 * is as asked, so it is safe on every `styledata`.
 */
export function applyNameLayersVisibility(map: Visibility, hidden: boolean) {
  for (const id of NAME_LAYERS) {
    if (id === PLANT_NAME_LAYER || !map.getLayer(id)) continue
    const wanted = hidden ? 'none' : 'visible'
    if ((map.getLayoutProperty(id, 'visibility') ?? 'visible') !== wanted) map.setLayoutProperty(id, 'visibility', wanted)
  }
}
