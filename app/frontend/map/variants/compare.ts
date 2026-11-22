import { useSyncExternalStore } from 'react'

/**
 * Another variant laid over the one shown, like a teammate's sheet of
 * tracing paper on one's own: its own elements in its ink, a fade between
 * the two, and a click on one of them picks it to copy here. One at a
 * time, for this viewer only.
 */
type State = { other: number | null; fade: number; picked: number | null }

let state: State = { other: null, fade: 0.5, picked: null }
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

export const compareStore = { get: () => state }
export const useCompareState = <T,>(select: (s: State) => T): T => useSyncExternalStore(subscribe, () => select(state))
export const useCompared = () => useCompareState((s) => s.other)

/** Lays this variant over the one shown (null: takes it away). */
export const compareWith = (other: number | null) => emit({ other, picked: null })
export const setCompareFade = (fade: number) => emit({ fade: Math.min(1, Math.max(0, fade)) })
export const pickCompared = (picked: number | null) => emit({ picked })

/** A teammate's ink: leaf green, apart from the plum of a phase and the clay and ochre of what changed. */
export const COMPARE_INK = { line: '#1f6b46', wash: '#4f8a5b' }
