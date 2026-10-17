// What the terrain map shows. On the ground the phone is a tool to record
// what is there, so by default it shows the existing only: plants already
// in the ground, structures, networks… The project (plants still to plant,
// elements marked « En projet », your AI's drafts) comes back with one switch. Layers and plant strata can
// be hidden too, like in « Calques » on the website.
// Same rule as the website's « Situation actuelle » (app/frontend/map/scenario.ts).
import type { Planting } from './types'

export type Display = {
  /** Also show what is still a project: plants not planted yet, drafts. */
  projected: boolean
  hiddenLayers: string[]
  /** Plant strata keys (plants.strata), plus UNKNOWN_STRATA. */
  hiddenStrata: string[]
}

export const DEFAULT_DISPLAY: Display = { projected: false, hiddenLayers: [], hiddenStrata: [] }

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

export function isShown(p: Properties, display: Display, planting: Planting | undefined): boolean {
  if (!display.projected && isProjected(p)) return false
  if (display.hiddenLayers.includes(p.layer)) return false
  if (isPlant(p) && display.hiddenStrata.length > 0 && display.hiddenStrata.includes(strataOf(p, planting))) return false
  return true
}

/** The display that shows this feature again, or the same one when it already does. */
export function reveal(display: Display, p: Properties, planting: Planting | undefined): Display {
  if (isShown(p, display, planting)) return display
  return {
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
  return { projected: v.projected === true, hiddenLayers: strings(v.hiddenLayers), hiddenStrata: strings(v.hiddenStrata) }
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
