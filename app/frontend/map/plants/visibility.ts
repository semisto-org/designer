import type { Map as MapLibreMap } from 'maplibre-gl'
import type { PlantLabelStyle } from './labelRank.ts'

/** Layers the plants overlay draws from its own sources (crowns and names). */
export const PLANT_OVERLAY_LAYERS = ['plant-crowns-fill', 'plant-crowns-casing', 'plant-crowns-line', 'plant-labels-text']

/** The numbered pastilles, shown instead of the names in « Numéro » mode. */
export const PLANT_NUMBER_LAYERS = ['plant-numbers-disc', 'plant-numbers-text']

/**
 * The « Calques » panel hides design layers by filtering the features
 * source; the plant crowns and names live in sources of their own, so they
 * follow the « plants » layer here. Plants are named either by their name
 * (or code) beside the point, or by their number inside it, never both.
 */
export function applyPlantsVisibility(
  map: Pick<MapLibreMap, 'getLayer' | 'setLayoutProperty'>,
  hiddenLayers: string[],
  labelStyle: PlantLabelStyle = 'name',
) {
  const hidden = hiddenLayers.includes('plants')
  const numbered = labelStyle === 'number'
  const set = (id: string, shown: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', shown ? 'visible' : 'none')
  }
  for (const id of PLANT_OVERLAY_LAYERS) set(id, !hidden && !(numbered && id === 'plant-labels-text'))
  for (const id of PLANT_NUMBER_LAYERS) set(id, !hidden && numbered)
}
