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
