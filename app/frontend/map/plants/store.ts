import { useEffect, useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { PaletteItem, PlantingState } from '@/types/plants'

/**
 * Shared planting state of the open map (palette, species in use, patch
 * compositions, plant list, alerts), read by the palette and plant list
 * panels, the plant/patch inspector sections and the crowns overlay.
 * Every write endpoint answers with the refreshed state.
 */
type Store = {
  mapId: number | null
  data: PlantingState | null
  loading: boolean
  error: boolean
  /** Palette item being placed on the map (click-to-place loop). */
  placing: PaletteItem | null
}

let store: Store = { mapId: null, data: null, loading: false, error: false, placing: null }
const listeners = new Set<() => void>()

function emit(next: Partial<Store>) {
  store = { ...store, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let inflight: { mapId: number; promise: Promise<void> } | null = null

export function loadPlanting(mapId: number, { force = false } = {}): Promise<void> {
  if (store.mapId !== mapId) {
    inflight = null
    emit({ mapId, data: null, error: false, placing: null })
  }
  if (!force) {
    if (inflight?.mapId === mapId) return inflight.promise
    if (store.data) return Promise.resolve()
  }
  emit({ loading: true, error: false })
  const promise: Promise<void> = api<PlantingState>(`/maps/${mapId}/planting`)
    .then((data) => { if (store.mapId === mapId) emit({ data, loading: false }) })
    .catch(() => { if (store.mapId === mapId) emit({ loading: false, error: true }) })
    .finally(() => { if (inflight?.promise === promise) inflight = null })
  inflight = { mapId, promise }
  return promise
}

/** Applies a state returned by a write endpoint. */
export function setPlanting(mapId: number, data: PlantingState) {
  if (store.mapId === mapId) emit({ data, error: false })
}

export function setPlacing(item: PaletteItem | null) {
  emit({ placing: item })
}

let reloadTimer: number | undefined
/** Debounced reload, after features changed (plants placed, patch reshaped). */
export function scheduleReload(mapId: number, delay = 400) {
  window.clearTimeout(reloadTimer)
  reloadTimer = window.setTimeout(() => void loadPlanting(mapId, { force: true }), delay)
}

/** The planting of `mapId`, loaded on first use. */
export function usePlanting(mapId: number) {
  const state = useSyncExternalStore(subscribe, () => store)
  useEffect(() => { void loadPlanting(mapId) }, [mapId])
  const current = state.mapId === mapId
  return {
    data: current ? state.data : null,
    loading: current ? state.loading : true,
    error: current && state.error,
    placing: current ? state.placing : null,
    reload: () => loadPlanting(mapId, { force: true }),
  }
}
