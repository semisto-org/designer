import { useSyncExternalStore } from 'react'
import type { RegionLayerData } from '@/types'
import type { LayerChoice } from '@/types/map_data'

/**
 * What the map shows from the region catalogue: one base map, the data
 * overlays switched on and their opacity. Shared by the always-mounted
 * overlay (which applies it to MapLibre) and the "Couches" panel (which
 * edits it). The choice is remembered per map in localStorage.
 */
export type LayerState = LayerChoice & {
  mapId: number | null
  /** Overlays shown for a while by a tool (the cadastre while picking parcels). */
  forced: string[]
  /** Layers whose tiles or style failed to load. */
  errors: string[]
  /** A tool that owns map clicks for now (identify stays quiet). */
  clickOwner: string | null
}

const EMPTY: LayerState = { mapId: null, base: null, overlays: [], opacity: {}, forced: [], errors: [], clickOwner: null }

let state: LayerState = EMPTY
const listeners = new Set<() => void>()

const storageKey = (mapId: number) => `designer.map.${mapId}.layers`

function read(mapId: number): Partial<LayerChoice> {
  try {
    const raw = window.localStorage.getItem(storageKey(mapId))
    return raw ? (JSON.parse(raw) as Partial<LayerChoice>) : {}
  } catch {
    return {}
  }
}

function persist() {
  if (state.mapId == null) return
  const { base, overlays, opacity } = state
  try {
    window.localStorage.setItem(storageKey(state.mapId), JSON.stringify({ base, overlays, opacity }))
  } catch {
    // Private mode or full storage: the choice is simply not remembered.
  }
}

function set(patch: Partial<LayerState>, remember = true) {
  state = { ...state, ...patch }
  if (remember) persist()
  listeners.forEach((listener) => listener())
}

const toggle = (list: string[], key: string, on: boolean) =>
  on ? (list.includes(key) ? list : [...list, key]) : list.filter((k) => k !== key)

export const layerStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  /** Restores the remembered choice of this map, checked against its catalogue. */
  init(mapId: number, layers: RegionLayerData[]) {
    const saved = read(mapId)
    const bases = layers.filter((l) => l.category === 'base')
    const overlayKeys = new Set(layers.filter((l) => l.category === 'overlay').map((l) => l.key))
    const fallbackBase = (bases.find((l) => l.options.default === true) ?? bases[0])?.key ?? null
    const base = saved.base && bases.some((l) => l.key === saved.base) ? saved.base : fallbackBase
    const overlays = (saved.overlays ?? []).filter((k) => overlayKeys.has(k))
    const opacity: Record<string, number> = {}
    Object.entries(saved.opacity ?? {}).forEach(([key, value]) => {
      if (overlayKeys.has(key) && typeof value === 'number' && value >= 0 && value <= 1) opacity[key] = value
    })
    state = { ...EMPTY, mapId, base, overlays, opacity }
    listeners.forEach((listener) => listener())
  },

  setBase(key: string) {
    set({ base: key, errors: state.errors.filter((k) => k !== key) })
  },
  setOverlay(key: string, on: boolean) {
    set({ overlays: toggle(state.overlays, key, on), errors: on ? state.errors.filter((k) => k !== key) : state.errors })
  },
  setOpacity(key: string, value: number) {
    set({ opacity: { ...state.opacity, [key]: Math.min(1, Math.max(0, value)) } })
  },
  hideAll() {
    set({ overlays: [] })
  },
  force(key: string, on: boolean) {
    set({ forced: toggle(state.forced, key, on) }, false)
  },
  markError(key: string) {
    if (!state.errors.includes(key)) set({ errors: [...state.errors, key] }, false)
  },
  claimClicks(owner: string) {
    set({ clickOwner: owner }, false)
  },
  releaseClicks(owner: string) {
    if (state.clickOwner === owner) set({ clickOwner: null }, false)
  },
}

export function useLayerState(): LayerState {
  return useSyncExternalStore(layerStore.subscribe, layerStore.get, layerStore.get)
}

/** Overlays actually on the map: chosen ones plus those a tool forces. */
export function visibleOverlays(s: LayerState): string[] {
  return [...new Set([...s.overlays, ...s.forced])]
}

export function opacityOf(s: LayerState, layer: RegionLayerData): number {
  return s.opacity[layer.key] ?? layer.opacity
}
