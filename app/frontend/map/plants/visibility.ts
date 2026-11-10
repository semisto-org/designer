import type { Map as MapLibreMap } from 'maplibre-gl'
import type { PlantLabelStyle } from './labelRank.ts'
import { isPresentRendering, isWorkingLayer } from '../presentation/renderRules.ts'

/** Layers the plants overlay draws from its own sources (crowns and names). */
export const PLANT_OVERLAY_LAYERS = ['plant-crowns-shadow', 'plant-crowns-fill', 'plant-crowns-reach', 'plant-crowns-support', 'plant-crowns-reach-line', 'plant-crowns-casing', 'plant-crowns-line', 'plant-trunks', 'plant-labels-text']

/** The numbered pastilles, shown instead of the names in « Numéro » mode. */
export const PLANT_NUMBER_LAYERS = ['plant-numbers-disc', 'plant-numbers-text']

/**
 * The « Calques » panel hides design layers by filtering the features
 * source; the plant crowns and names live in sources of their own, so they
 * follow the « plants » layer here. Plants are named either by their name
 * (or code) beside the point, or by their number inside it, never both.
 * With the names hidden (« Noms sur la carte » in « Calques »), they show on
 * hover only (map/drawing/LabelPeek); the numbers stay on their dots.
 */
export function applyPlantsVisibility(
  map: Pick<MapLibreMap, 'getLayer' | 'setLayoutProperty'>,
  hiddenLayers: string[],
  labelStyle: PlantLabelStyle = 'name',
  labelsHidden = false,
) {
  const hidden = hiddenLayers.includes('plants')
  const numbered = labelStyle === 'number'
  const rendering = isPresentRendering(map)
  const set = (id: string, shown: boolean) => {
    // The « rendu présentation » keeps names and numbers hidden (map/presentation/render).
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', shown && !(rendering && isWorkingLayer(id)) ? 'visible' : 'none')
  }
  for (const id of PLANT_OVERLAY_LAYERS) set(id, !hidden && !((numbered || labelsHidden) && id === 'plant-labels-text'))
  for (const id of PLANT_NUMBER_LAYERS) set(id, !hidden && numbered)
}
