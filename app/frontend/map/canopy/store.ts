import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { CanopyBounds } from '@/map/canopy/ramp'

/** GET /maps/:id/canopy (Canopy::MapReport). */
export type CanopyReport =
  | {
      available: true
      grid: { width: number; height: number; cellM: number; bounds: CanopyBounds; data: string }
      stats: {
        terrainAreaM2: number
        maxHeightM: number
        canopyAreaM2: number
        canopyShare: number
        meanCanopyHeightM: number | null
        tallAreaM2: number
      }
      thresholds: { canopyM: number; tallM: number }
      imagery: { from: string; to: string } | null
      source: { key: string; attribution: string; licence: string; url: string }
    }
  | { available: false; reason: 'not_configured' | 'no_outline' | 'too_large' | 'no_coverage' | 'upstream_error' }

/**
 * The canopy report of the open map, shared by the « Arbres en place »
 * panel and the overlay that paints it. `version` is what the report was
 * loaded for (the outline): a new outline loads again.
 */
type State = {
  mapId: number | null
  version: string | null
  report: CanopyReport | null
  loading: boolean
  error: boolean
  showOnMap: boolean
}

let state: State = { mapId: null, version: null, report: null, loading: false, error: false, showOnMap: false }
const listeners = new Set<() => void>()
let request: AbortController | null = null

function emit(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCanopy(): State {
  return useSyncExternalStore(subscribe, () => state)
}

export const canopyActions = {
  /** Loads the report unless it is already there (or on its way) for this map and outline. */
  load(mapId: number, version: string, force = false) {
    if (state.mapId !== mapId) emit({ mapId, version: null, report: null, error: false, showOnMap: false })
    if (!force && state.version === version && (state.report || state.loading)) return
    request?.abort()
    const controller = new AbortController()
    request = controller
    emit({ version, loading: true, error: false })
    api<CanopyReport>(`/maps/${mapId}/canopy`, { signal: controller.signal })
      .then((report) => { if (state.mapId === mapId) emit({ report, loading: false }) })
      .catch((e: Error) => { if (e.name !== 'AbortError' && state.mapId === mapId) emit({ loading: false, error: true }) })
  },

  setShowOnMap(showOnMap: boolean) {
    emit({ showOnMap })
  },
}
