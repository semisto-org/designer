import { useSyncExternalStore } from 'react'

/**
 * Small shared state of the drawing tools: which design layers are hidden
 * (per viewer and per map, kept in localStorage), which tool is open and the
 * feature whose shape is being edited. Shared by the toolbar, the
 * inspector section, the layers panel and the exports.
 */
export type DrawingTool = 'draw' | 'measure' | 'sketch' | 'shape' | null

export type DrawingState = {
  mapId: number | null
  hiddenLayers: string[]
  tool: DrawingTool
  shapeEditId: number | null
}

let state: DrawingState = { mapId: null, hiddenLayers: [], tool: null, shapeEditId: null }
const listeners = new Set<() => void>()

export const drawingStore = {
  get: () => state,
  set(patch: Partial<DrawingState>) {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function useDrawingState<T>(select: (s: DrawingState) => T): T {
  return useSyncExternalStore(drawingStore.subscribe, () => select(state))
}

const storageKey = (mapId: number) => `designer:map:${mapId}:hidden-layers`

/** Loads the hidden layers remembered for this map (if storage allows). */
export function initDrawingState(mapId: number) {
  if (state.mapId === mapId) return
  let hidden: string[] = []
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(mapId)) ?? '[]')
    if (Array.isArray(saved)) hidden = saved.filter((v): v is string => typeof v === 'string')
  } catch {
    hidden = []
  }
  drawingStore.set({ mapId, hiddenLayers: hidden, tool: null, shapeEditId: null })
}

export function setHiddenLayers(hidden: string[]) {
  drawingStore.set({ hiddenLayers: hidden })
  if (state.mapId == null) return
  try {
    window.localStorage.setItem(storageKey(state.mapId), JSON.stringify(hidden))
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}

/** Asks the drawing toolbar to let the user reshape a feature. */
export function startShapeEdit(featureId: number) {
  drawingStore.set({ tool: 'shape', shapeEditId: featureId })
}
