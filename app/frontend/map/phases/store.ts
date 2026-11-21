import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { DesignPhase, OpenPhase } from './types'

/**
 * The design phases of the open map (from the server), and the one put
 * away that this viewer reopened to look at, with how far it shows over
 * today's map (`fade`: 0 = today only, 1 = the phase alone on paper).
 */
type State = {
  mapId: number | null
  current: string
  phases: DesignPhase[]
  loaded: boolean
  open: OpenPhase | null
  fade: number
  /** The phase element the viewer clicked on the map. */
  picked: number | null
}

let state: State = { mapId: null, current: '', phases: [], loaded: false, open: null, fade: 0.6, picked: null }
const listeners = new Set<() => void>()

function emit(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePhases<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

export type PhasesPayload = { current: string; phases: DesignPhase[]; id?: number }

export function setPhases(mapId: number, data: PhasesPayload) {
  // An answer about a map the viewer has left since is dropped.
  if (state.mapId !== mapId) return
  emit({ mapId, current: data.current, phases: data.phases, loaded: true, open: state.open && data.phases.some((p) => p.id === state.open?.id) ? state.open : null })
}

/** The editor opened this map: what belonged to another map goes. */
export function forMap(mapId: number) {
  if (state.mapId !== mapId) emit({ mapId, current: '', phases: [], loaded: false, open: null, picked: null, fade: 0.6 })
}

/** Reads the map's phases again (each time the panel opens: a teammate may have put one away). */
export async function loadPhases(mapId: number) {
  forMap(mapId)
  setPhases(mapId, await api<PhasesPayload>(`/maps/${mapId}/design/phases`))
}

/** Reopens a phase put away, read-only, over today's map. */
export async function openPhase(mapId: number, id: number) {
  const data = await api<OpenPhase>(`/maps/${mapId}/design/phases/${id}`)
  if (state.mapId === mapId) emit({ open: data, picked: null })
}

export const closePhase = () => emit({ open: null, picked: null })
export const pickPhaseElement = (id: number | null) => emit({ picked: id })
export const setPhaseFade = (fade: number) => emit({ fade: Math.min(1, Math.max(0, fade)) })
