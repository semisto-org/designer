import type { Map as MapLibreMap } from 'maplibre-gl'

/** Layers the plants overlay draws from its own sources (crowns and names). */
export const PLANT_OVERLAY_LAYERS = ['plant-crowns-fill', 'plant-crowns-line', 'plant-labels-text']

/**
 * The « Calques » panel hides design layers by filtering the features
 * source; the plant crowns and names live in sources of their own, so they
 * follow the « plants » layer here.
 */
export function applyPlantsVisibility(map: Pick<MapLibreMap, 'getLayer' | 'setLayoutProperty'>, hiddenLayers: string[]) {
  const visibility = hiddenLayers.includes('plants') ? 'none' : 'visible'
  for (const id of PLANT_OVERLAY_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility)
  }
}
