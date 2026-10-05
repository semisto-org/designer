/**
 * What the soil module shows: its own switch (or a suggestion in progress)
 * decides; on top, the sampling points and bio-indicator plants are part of
 * the survey of what exists, so hiding « Existant » in « Calques » hides them.
 * Suggested positions are a tool in use and stay.
 */
export function soilVisibility(state: { showOnMap: boolean; suggesting: boolean; hiddenLayers: string[] }) {
  const shown = state.showOnMap || state.suggesting
  return { points: shown && !state.hiddenLayers.includes('existing'), suggestions: shown }
}
