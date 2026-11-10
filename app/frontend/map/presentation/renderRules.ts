/**
 * Pure rules of the « rendu présentation » (map/presentation/render), kept
 * apart from React and MapLibre so they can be tested on their own.
 */

/** The plan rendering is on while presenting a step shown in « Projet ». */
export function presentRender(presenting: boolean, mode: string): boolean {
  return presenting && mode === 'project'
}

/** Layers of the working tool, left out of the plan while presenting the project. */
const WORKING_PREFIXES = [
  'features-label', 'drawing-measure-label', 'plant-labels', 'plant-numbers', 'soil-', 'photos', 'weather-stations', 'pending-updates',
  'canopy-height', 'catchment', 'harvest-rings', 'earthworks-arrows', 'gps-accuracy', 'draw-vertex-hint',
]

export function isWorkingLayer(id: string): boolean {
  return WORKING_PREFIXES.some((prefix) => id.startsWith(prefix))
}

/**
 * Feature layers (« Calques ») left out of the plan: notes are the designer's
 * working marks, not the client's plan. Free zones and lines (« Dessins ») stay
 * when the map shows them: named, coloured zones are part of what a designer
 * presents (« Verger, 20 ares »), and the person hides them in « Calques ».
 */
export const RENDER_HIDDEN_LAYERS = ['notes']

/** The layers hidden on the map: the viewer's choice, plus the working marks while presenting the project. */
export function renderHiddenLayers(hidden: string[], render: boolean): string[] {
  if (!render) return hidden
  return [...new Set([...hidden, ...RENDER_HIDDEN_LAYERS])]
}

/**
 * Elements that record a measure or an observation rather than a piece of
 * the design (an infiltration test, a storm's runoff, a slope break): the
 * plan leaves them out, as it leaves out the notes.
 */
export const RENDER_HIDDEN_KINDS = ['infiltration_test', 'storm_observation', 'slope_break', 'measure']

export function isHiddenInRender(kind: unknown): boolean {
  return typeof kind === 'string' && RENDER_HIDDEN_KINDS.includes(kind)
}

/**
 * Whether this map draws the plan right now (MapLibre global state
 * `presentRender`). Code that shows or hides a working layer asks it first,
 * so it never shows again what the plan hid: two owners flipping a layer's
 * visibility on every `styledata` would reload the sources each frame.
 */
export function isPresentRendering(map: object): boolean {
  const state = (map as { getGlobalState?: () => Record<string, unknown> | undefined }).getGlobalState?.()
  return state?.presentRender === true
}

/** Walked or driven lines, drawn as ribbons at their width in the « rendu présentation ». */
export const RIBBON_KINDS = ['path', 'track', 'path_existing']
