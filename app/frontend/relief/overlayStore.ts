import type { Map as MapLibreMap } from 'maplibre-gl'
import { useSyncExternalStore } from 'react'
import type { TerrainGridData } from '@/types/relief'
import type { Design } from './design.ts'
import { designsKey, removeReliefOverlay, showReliefOverlay, type MapOverlayMode } from './mapOverlay.ts'

/**
 * Which relief overlay (flow axes, hillshade or nothing) lies on the 2D map,
 * per map, shared by « Couches » and « Eau et relief » so both say the same.
 * It survives closing either panel: the overlay stays on the map. The flow
 * axes follow the water works dug into the relief (`dug`: « Projet » mode,
 * like the 3D view) or the terrain as it is (« Existant »).
 */
export type ReliefOverlayState = { mode: MapOverlayMode; computing: boolean; failed: boolean; dug: boolean }

const NONE: ReliefOverlayState = { mode: 'none', computing: false, failed: false, dug: false }
const states = new Map<number, ReliefOverlayState>()
const grids = new Map<number, TerrainGridData>()
const works = new Map<number, Design[]>()
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

async function render(map: MapLibreMap, mapId: number, grid: TerrainGridData, mode: MapOverlayMode) {
  const designs = works.get(mapId) ?? []
  const key = designsKey(designs)
  set(mapId, { mode, failed: false, computing: mode !== 'none', dug: mode === 'flow' && designs.length > 0 })
  if (mode === 'none') return removeReliefOverlay(map)
  try {
    await showReliefOverlay(map, grid, mode, designs)
    // Another choice (or other works) came in while this one was computing: it wins.
    const current = reliefOverlayState(mapId).mode
    if (current !== mode || designsKey(works.get(mapId) ?? []) !== key) {
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

/** Lays the chosen overlay on the map (computed in the browser the first time), or takes it off. */
export function chooseReliefOverlay(map: MapLibreMap, mapId: number, grid: TerrainGridData, mode: MapOverlayMode): Promise<void> {
  grids.set(mapId, grid)
  return render(map, mapId, grid, mode)
}

/**
 * The water works to dig before computing the flow axes (none: the terrain
 * as it is). Redraws the axes on the map when they are shown and the works
 * changed.
 */
export function setReliefWorks(map: MapLibreMap, mapId: number, designs: Design[]): Promise<void> | void {
  const before = designsKey(works.get(mapId) ?? [])
  works.set(mapId, designs)
  const { mode } = reliefOverlayState(mapId)
  const grid = grids.get(mapId)
  if (mode !== 'flow' || !grid || designsKey(designs) === before) return
  return render(map, mapId, grid, mode)
}

/** The grid the overlay was last computed on (null before a first choice). */
export const reliefOverlayGrid = (mapId: number): TerrainGridData | null => grids.get(mapId) ?? null
