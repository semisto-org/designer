import type { Map as MapLibreMap } from 'maplibre-gl'

export const SAMPLE_LAYER = 'soil-samples-circle'
export const OBSERVATION_LAYER = 'soil-observations-circle'
export const SUGGESTION_LAYER = 'soil-suggestions-circle'

/** The soil markers « Calques » can hide one by one. */
export const SOIL_MARKERS = ['bioindicators', 'samples'] as const
export type SoilMarker = (typeof SOIL_MARKERS)[number]

/**
 * What the soil module shows: its own switch (or a suggestion in progress)
 * decides; on top, the sampling points and bio-indicator plants are part of
 * the survey of what exists, so hiding « Existant » in « Calques » hides them,
 * and each can be hidden on its own there (`hiddenSoil`). Suggested
 * positions are a tool in use and stay.
 */
export function soilVisibility(state: { showOnMap: boolean; suggesting: boolean; hiddenLayers: string[]; hiddenSoil?: string[] }) {
  const shown = state.showOnMap || state.suggesting
  const existing = shown && !state.hiddenLayers.includes('existing')
  const hiddenSoil = state.hiddenSoil ?? []
  return {
    samples: existing && !hiddenSoil.includes('samples'),
    bioindicators: existing && !hiddenSoil.includes('bioindicators'),
    suggestions: shown,
  }
}

/** Which soil layers each switch shows: a marker always goes with its name. */
const LAYERS_OF = {
  samples: ['soil-samples-halo', SAMPLE_LAYER, 'soil-samples-label'],
  bioindicators: [OBSERVATION_LAYER, 'soil-observations-label'],
  suggestions: [SUGGESTION_LAYER, 'soil-suggestions-rank'],
} as const

/**
 * The names written beside the markers (« Point 3 », the species noted).
 * « Noms sur la carte » off in « Calques » takes them away with the other
 * names; the marker stays and shows its name on hover (LabelPeek). The ranks
 * of the suggested positions are numbers, not names: they stay.
 */
export const SOIL_NAME_LAYERS: readonly string[] = ['soil-samples-label', 'soil-observations-label']

/** The soil markers whose name LabelPeek shows on hover. */
export const SOIL_PEEK_LAYERS: readonly string[] = [SAMPLE_LAYER, OBSERVATION_LAYER]

export function setSoilLayersVisible(
  map: Pick<MapLibreMap, 'getLayer' | 'setLayoutProperty'>,
  visible: { samples: boolean; bioindicators: boolean; suggestions: boolean },
  labelsHidden = false,
) {
  for (const [group, ids] of Object.entries(LAYERS_OF) as [keyof typeof LAYERS_OF, readonly string[]][]) {
    ids.forEach((id) => {
      const shown = visible[group] && !(labelsHidden && SOIL_NAME_LAYERS.includes(id))
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', shown ? 'visible' : 'none')
    })
  }
}
