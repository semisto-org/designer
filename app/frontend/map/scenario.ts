/**
 * What is still a project on the map: a plant not yet marked as planted, an
 * element marked « En projet ». The editor draws it apart (dashed crown or
 * outline, faint fill, hollow point, 75 % opacity), and the time strip
 * (map/time) leaves it out of the land on arrival.
 */
type Properties = Record<string, unknown> | null | undefined

/** A plant drawn on the plan but not marked as planted yet. */
export function isPlannedPlant(properties: Properties): boolean {
  return properties?.kind === 'plant' && properties?.layer === 'plants' && typeof properties?.planted_on !== 'string'
}

/**
 * Any other element (pond, hedge, path, shed…) marked « En projet »:
 * `planned: true`, until it is marked as done (`built_on`).
 */
export function isPlannedElement(properties: Properties): boolean {
  return properties?.planned === true && !(properties?.kind === 'plant' && properties?.layer === 'plants')
}

/**
 * Constructions with a roof: drawn, they stand as volumes in the 3D view
 * (and cast their shadow); planned, they never leave in a public view.
 * Twin of MapFeature::BUILDING_KINDS.
 */
export const BUILDING_KINDS: ReadonlySet<string> = new Set(['building', 'shed', 'shelter', 'greenhouse', 'fruit_store', 'poultry_house'])

/** What the « Existant » layer holds that can still be a project: a building, a wall. */
const PLANNABLE_EXISTING = new Set(['building', 'wall'])

/**
 * Whether an element of this layer and kind can be « En projet ». Notes are
 * not works on the land, a plant has its planting date, and what the
 * « Existant » layer holds is there by definition, except a building or a
 * wall that is yet to be built. Twin of MapFeature#plannable?.
 */
export function canBePlanned(layer: unknown, kind: unknown): boolean {
  if (layer === 'notes' || (layer === 'plants' && kind === 'plant')) return false
  if (layer === 'existing') return PLANNABLE_EXISTING.has(String(kind))
  return typeof layer === 'string'
}

/** What is not on the ground yet: a planned plant or a planned element. */
export function isPlanned(properties: Properties): boolean {
  return isPlannedPlant(properties) || isPlannedElement(properties)
}

/** Opacity of what is still a project, so it reads as « not there yet ». */
export const PLANNED_OPACITY = 0.75

/** MapLibre expression twin of isPlannedPlant, for paint and filters. */
export const PLANNED_PLANT_EXPR = [
  'all',
  ['==', ['get', 'layer'], 'plants'],
  ['==', ['get', 'kind'], 'plant'],
  ['!=', ['typeof', ['get', 'planted_on']], 'string'],
] as const

/** MapLibre expression twin of isPlannedElement. */
export const PLANNED_ELEMENT_EXPR = [
  'all',
  ['==', ['get', 'planned'], true],
  ['!', ['all', ['==', ['get', 'layer'], 'plants'], ['==', ['get', 'kind'], 'plant']]],
] as const

/** MapLibre expression twin of isPlanned. */
export const PLANNED_EXPR = ['any', PLANNED_PLANT_EXPR, PLANNED_ELEMENT_EXPR] as const
