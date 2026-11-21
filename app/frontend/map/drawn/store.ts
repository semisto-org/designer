import { useSyncExternalStore } from 'react'
import { clampPhoto, parseChoice, type DrawnViewChoice } from './rules'

/**
 * The « vue dessinée » chosen by this viewer for this map: on or off, and
 * how much of the photo shows through. Remembered in localStorage, on by
 * default: designing starts on paper.
 */
type State = DrawnViewChoice & { mapId: number | null }

let state: State = { mapId: null, ...parseChoice(null) }
const listeners = new Set<() => void>()

const storageKey = (mapId: number) => `designer:map:${mapId}:drawn-view`

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
  if (state.mapId == null) return
  try {
    window.localStorage.setItem(storageKey(state.mapId), JSON.stringify({ enabled: state.enabled, photo: state.photo }))
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

export function initDrawnView(mapId: number) {
  if (state.mapId === mapId) return
  let saved: unknown = null
  try {
    saved = JSON.parse(window.localStorage.getItem(storageKey(mapId)) ?? 'null')
  } catch {
    saved = null
  }
  state = { mapId, ...parseChoice(saved) }
  listeners.forEach((listener) => listener())
}

export const setDrawnViewEnabled = (enabled: boolean) => set({ enabled })
export const setDrawnViewPhoto = (photo: number) => set({ photo: clampPhoto(photo) })

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDrawnViewChoice<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state), () => pick(state))
}
