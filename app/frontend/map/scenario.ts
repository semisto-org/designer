import { useSyncExternalStore } from 'react'

/**
 * « Situation actuelle » / « situation projetée » on the editor map.
 *
 * - projected (default): everything, with what is still a project (a plant
 *   not yet marked as planted, an element marked « En projet ») drawn apart:
 *   dashed crown or outline, faint fill, hollow point, all at 75 % opacity;
 * - current: what is on the ground today only, so planned plants, planned
 *   elements and Claude's drafts are hidden.
 *
 * The choice is per viewer and per map, kept in localStorage.
 */
export type Scenario = 'current' | 'projected'

export const DEFAULT_SCENARIO: Scenario = 'projected'

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

/** What is not on the ground yet: a planned plant or a planned element. */
export function isPlanned(properties: Properties): boolean {
  return isPlannedPlant(properties) || isPlannedElement(properties)
}

/** Whether a feature is shown in the given scenario. */
export function inScenario(properties: Properties, scenario: Scenario): boolean {
  if (scenario === 'projected') return true
  return properties?.status !== 'draft' && !isPlanned(properties)
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

/** Extra filter test for the scenario, or null when it shows everything. */
export function scenarioFilter(scenario: Scenario): unknown[] | null {
  if (scenario === 'projected') return null
  return ['all', ['!', PLANNED_EXPR], ['!=', ['coalesce', ['get', 'status'], 'active'], 'draft']]
}

// --- Store ---------------------------------------------------------------

let state: { mapId: number | null; scenario: Scenario } = { mapId: null, scenario: DEFAULT_SCENARIO }
const listeners = new Set<() => void>()

const storageKey = (mapId: number) => `designer:map:${mapId}:scenario`

function emit(next: typeof state) {
  state = next
  listeners.forEach((listener) => listener())
}

export const scenarioStore = {
  get: () => state.scenario,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function parseScenario(value: unknown): Scenario {
  return value === 'current' || value === 'projected' ? value : DEFAULT_SCENARIO
}

/** Loads the scenario remembered for this map (if storage allows). */
export function initScenario(mapId: number) {
  if (state.mapId === mapId) return
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(storageKey(mapId))
  } catch {
    saved = null
  }
  emit({ mapId, scenario: parseScenario(saved) })
}

export function setScenario(scenario: Scenario) {
  emit({ ...state, scenario })
  if (state.mapId == null) return
  try {
    window.localStorage.setItem(storageKey(state.mapId), scenario)
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

export function useScenario(): Scenario {
  return useSyncExternalStore(scenarioStore.subscribe, scenarioStore.get, () => DEFAULT_SCENARIO)
}
