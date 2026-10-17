import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { HarvestLogData } from '@/types/harvests'

/**
 * The harvest log of the open map for the season shown, shared by the
 * « Récoltes » panel and the overlay that rings the trees on the map.
 */
type State = { mapId: number | null; season: number; log: HarvestLogData | null; loading: boolean; error: boolean }

let state: State = { mapId: null, season: new Date().getFullYear(), log: null, loading: false, error: false }
const listeners = new Set<() => void>()
let request: AbortController | null = null

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export const harvestsActions = {
  load(mapId: number, season: number = state.mapId === mapId ? state.season : new Date().getFullYear()) {
    request?.abort()
    const controller = new AbortController()
    request = controller
    set({ mapId, season, loading: true, error: false, log: state.mapId === mapId && state.season === season ? state.log : null })
    api<HarvestLogData>(`/maps/${mapId}/harvests?season=${season}`, { signal: controller.signal })
      .then((log) => { if (request === controller) set({ log, loading: false }) })
      .catch(() => { if (request === controller && !controller.signal.aborted) set({ loading: false, error: true }) })
  },
  /** A fresh log from a save (same map): shown at once, season included. */
  replace(mapId: number, log: HarvestLogData) {
    if (state.mapId !== mapId) return
    set({ log, season: log.season, loading: false, error: false })
  },
  /** Something changed elsewhere (a plant's sheet): reload if loaded. */
  refresh(mapId: number) {
    if (state.mapId === mapId && state.log) harvestsActions.load(mapId, state.season)
  },
}

export function useHarvests(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
}
