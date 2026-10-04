import { useSyncExternalStore } from 'react'
import type { AerialView } from '@/types/drone'

/**
 * Which drone view the map shows over its base map, and how opaque.
 * Shared by the always-mounted overlay (which applies it to MapLibre) and
 * the « Couches » panel (which edits it). Remembered per map in
 * localStorage; a view delivered since the last visit is shown first.
 */
export type AerialState = {
  mapId: number | null
  /** The view shown, null for none. */
  viewId: number | null
  opacity: number
  /** Views whose tiles could not be loaded at all. */
  errors: number[]
}

type Saved = { viewId?: number | null; latestSeen?: number | null; opacity?: number }

const EMPTY: AerialState = { mapId: null, viewId: null, opacity: 1, errors: [] }

let state: AerialState = EMPTY
let latestSeen: number | null = null
const listeners = new Set<() => void>()

const storageKey = (mapId: number) => `designer.map.${mapId}.aerial`

function read(mapId: number): Saved | null {
  try {
    const raw = window.localStorage.getItem(storageKey(mapId))
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

function persist() {
  if (state.mapId == null) return
  try {
    window.localStorage.setItem(storageKey(state.mapId), JSON.stringify({ viewId: state.viewId, latestSeen, opacity: state.opacity }))
  } catch {
    // Private mode or full storage: the choice is simply not remembered.
  }
}

function set(patch: Partial<AerialState>, remember = true) {
  state = { ...state, ...patch }
  if (remember) persist()
  listeners.forEach((listener) => listener())
}

/** What to show when the map opens: a newly delivered view, else the remembered choice. */
export function initialViewId(views: AerialView[], saved: Saved | null): number | null {
  if (views.length === 0) return null
  const newestDelivery = Math.max(...views.map((v) => v.id))
  if (saved?.latestSeen == null || newestDelivery > saved.latestSeen) return newestDelivery
  if (saved.viewId === null) return null
  return views.some((v) => v.id === saved.viewId) ? (saved.viewId as number) : views[0].id
}

export const aerialStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  init(mapId: number, views: AerialView[]) {
    if (views.length === 0) {
      // Nothing to show, nothing to remember (no key for maps without views).
      latestSeen = null
      state = { ...EMPTY, mapId }
    } else {
      const saved = read(mapId)
      const opacity = typeof saved?.opacity === 'number' && saved.opacity >= 0 && saved.opacity <= 1 ? saved.opacity : 1
      latestSeen = Math.max(...views.map((v) => v.id))
      state = { ...EMPTY, mapId, viewId: initialViewId(views, saved), opacity }
      persist()
    }
    listeners.forEach((listener) => listener())
  },

  select(viewId: number | null) {
    set({ viewId, errors: viewId == null ? state.errors : state.errors.filter((id) => id !== viewId) })
  },
  setOpacity(value: number) {
    set({ opacity: Math.min(1, Math.max(0, value)) })
  },
  markError(viewId: number) {
    if (!state.errors.includes(viewId)) set({ errors: [...state.errors, viewId] }, false)
  },
}

export function useAerialState(): AerialState {
  return useSyncExternalStore(aerialStore.subscribe, aerialStore.get, aerialStore.get)
}
