import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { JourneyData } from '@/types/journey'

// One journey at a time (the editor shows one map): shared by the overlay
// chip, which keeps it fresh, and the journey panel, which reads it.
type State = { mapId: number | null; data: JourneyData | null; loading: boolean; failed: boolean }

let state: State = { mapId: null, data: null, loading: false, failed: false }
const listeners = new Set<() => void>()
let sequence = 0

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export async function refreshJourney(mapId: number, seen: string[]) {
  const mine = ++sequence
  set({ mapId, loading: true, ...(state.mapId !== mapId ? { data: null } : {}) })
  try {
    const query = seen.length ? `?seen=${encodeURIComponent(seen.join(','))}` : ''
    const data = await api<JourneyData>(`/maps/${mapId}/journey${query}`)
    if (mine === sequence) set({ data, loading: false, failed: false })
  } catch {
    if (mine === sequence) set({ loading: false, failed: true })
  }
}

export function useJourneyState(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}
