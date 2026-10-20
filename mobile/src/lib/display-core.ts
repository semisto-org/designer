// What the terrain map shows. On the ground the phone is a tool to record
// what is there, so by default it shows the existing only: plants already
// in the ground, structures, networks… The project (plants still to plant,
// elements marked « En projet », your AI's drafts) comes back with one switch. Layers and plant strata can
// be hidden too, like in « Calques » on the website.
// What counts as a project is the website's rule (isPlanned in app/frontend/map/scenario.ts).
import type { Planting } from './types'

export type Display = {
  /** Also show what is still a project: plants not planted yet, drafts. */
  projected: boolean
  hiddenLayers: string[]
  /** Plant strata keys (plants.strata), plus UNKNOWN_STRATA. */
  hiddenStrata: string[]
  /** The drone view laid over the base map, if any. */
  aerialViewId?: number | null
}

export const DEFAULT_DISPLAY: Display = { projected: false, hiddenLayers: [], hiddenStrata: [], aerialViewId: null }

/** Plants whose species (or its strata) is not known. */
export const UNKNOWN_STRATA = 'unknown'

export type Properties = { layer: string; kind: string; status?: string; planted_on?: unknown; planned?: unknown; species_id?: unknown }

const isPlant = (p: Properties) => p.layer === 'plants' && p.kind === 'plant'

/** A plant drawn on the plan but not marked as planted yet. */
export const isPlannedPlant = (p: Properties) => isPlant(p) && typeof p.planted_on !== 'string'

/** Any other element (pond, hedge, path…) marked « En projet » on the website. */
export const isPlannedElement = (p: Properties) => !isPlant(p) && p.planned === true

/** Whether a feature belongs to the project rather than to the ground today. */
export const isProjected = (p: Properties) => p.status === 'draft' || isPlannedPlant(p) || isPlannedElement(p)

export function strataOf(p: Properties, planting: Planting | undefined): string {
  return planting?.species[String(p.species_id)]?.strata ?? UNKNOWN_STRATA
}

/**
 * Sectors (wind, fire, view… around the terrain) are arcs that only make
 * sense together on their own rings, as on the website: never on the
 * terrain's map nor in what is around.
 */
const OFF_MAP_KINDS: ReadonlySet<string> = new Set(['sector'])

export function isShown(p: Properties, display: Display, planting: Planting | undefined): boolean {
  if (OFF_MAP_KINDS.has(p.kind)) return false
  if (!display.projected && isProjected(p)) return false
  if (display.hiddenLayers.includes(p.layer)) return false
  if (isPlant(p) && display.hiddenStrata.length > 0 && display.hiddenStrata.includes(strataOf(p, planting))) return false
  return true
}

/** The display that shows this feature again, or the same one when it already does. */
export function reveal(display: Display, p: Properties, planting: Planting | undefined): Display {
  if (isShown(p, display, planting)) return display
  return {
    ...display,
    projected: display.projected || isProjected(p),
    hiddenLayers: display.hiddenLayers.filter((layer) => layer !== p.layer),
    hiddenStrata: isPlant(p) ? display.hiddenStrata.filter((key) => key !== strataOf(p, planting)) : display.hiddenStrata,
  }
}

export const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key])

/** Something beyond the default is hidden (a layer or a strata). */
export const hidesMore = (display: Display) => display.hiddenLayers.length > 0 || display.hiddenStrata.length > 0

/** Reads a stored display, keeping only what makes sense. */
export function parseDisplay(value: unknown): Display {
  if (!value || typeof value !== 'object') return DEFAULT_DISPLAY
  const v = value as Record<string, unknown>
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  return {
    projected: v.projected === true, hiddenLayers: strings(v.hiddenLayers), hiddenStrata: strings(v.hiddenStrata),
    aerialViewId: typeof v.aerialViewId === 'number' && Number.isInteger(v.aerialViewId) ? v.aerialViewId : null,
  }
}

/** The drone view to show: the chosen one while the map still has it. */
export function shownAerialView<T extends { id: number }>(display: Display, views: T[] | undefined): T | null {
  return display.aerialViewId == null ? null : views?.find((view) => view.id === display.aerialViewId) ?? null
}

/** Counts per layer and per strata of the features on the map, for the settings screen. */
export function census(features: { properties: Properties }[], planting: Planting | undefined) {
  const layers: Record<string, number> = {}
  const strata: Record<string, number> = {}
  let projected = 0
  for (const { properties: p } of features) {
    layers[p.layer] = (layers[p.layer] ?? 0) + 1
    if (isPlant(p)) strata[strataOf(p, planting)] = (strata[strataOf(p, planting)] ?? 0) + 1
    if (isProjected(p)) projected++
  }
  return { layers, strata, projected }
}
