import type { Map as MapLibreMap } from 'maplibre-gl'
import { useSyncExternalStore } from 'react'
import type { TerrainGridData } from '@/types/relief'
import { removeReliefOverlay, showReliefOverlay, type MapOverlayMode } from './mapOverlay.ts'

/**
 * Which relief overlay (flow axes, hillshade or nothing) lies on the 2D map,
 * per map, shared by « Couches » and « Eau et relief » so both say the same.
 * It survives closing either panel: the overlay stays on the map.
 */
export type ReliefOverlayState = { mode: MapOverlayMode; computing: boolean; failed: boolean }

const NONE: ReliefOverlayState = { mode: 'none', computing: false, failed: false }
const states = new Map<number, ReliefOverlayState>()
const listeners = new Set<() => void>()

function set(mapId: number, patch: Partial<ReliefOverlayState>) {
  states.set(mapId, { ...(states.get(mapId) ?? NONE), ...patch })
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const reliefOverlayState = (mapId: number): ReliefOverlayState => states.get(mapId) ?? NONE

export function useReliefOverlay(mapId: number): ReliefOverlayState {
  return useSyncExternalStore(subscribe, () => reliefOverlayState(mapId))
}

/** Lays the chosen overlay on the map (computed in the browser the first time), or takes it off. */
export async function chooseReliefOverlay(map: MapLibreMap, mapId: number, grid: TerrainGridData, mode: MapOverlayMode): Promise<void> {
  set(mapId, { mode, failed: false, computing: mode !== 'none' })
  if (mode === 'none') return removeReliefOverlay(map)
  try {
    await showReliefOverlay(map, grid, mode)
    // Another choice came in while this one was computing: it wins.
    const current = reliefOverlayState(mapId).mode
    if (current !== mode) {
      if (current === 'none') removeReliefOverlay(map)
      return
    }
    set(mapId, { computing: false })
  } catch (e) {
    console.error(e)
    set(mapId, { mode: 'none', computing: false, failed: true })
    removeReliefOverlay(map)
  }
}
