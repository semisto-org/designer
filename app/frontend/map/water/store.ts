import { useEffect, useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { MapFeature } from '@/types'

/**
 * The water sources of the open map (well, rain, forest catchment…), shared
 * by the « Sources d'eau » panel and the tap inspector. Write endpoints
 * answer with the refreshed list and the taps they changed.
 */
export type WaterSource = {
  id: number
  name: string
  potable: boolean
  notes: string | null
  tapCount: number
}

export type WaterSourcesResponse = { sources: WaterSource[]; features?: MapFeature[] }

type Store = { mapId: number | null; sources: WaterSource[] | null; error: boolean }

let store: Store = { mapId: null, sources: null, error: false }
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

export function loadWaterSources(mapId: number, { force = false } = {}): Promise<void> {
  if (store.mapId !== mapId) {
    inflight = null
    emit({ mapId, sources: null, error: false })
  }
  if (!force) {
    if (inflight?.mapId === mapId) return inflight.promise
    if (store.sources) return Promise.resolve()
  }
  const promise: Promise<void> = api<WaterSourcesResponse>(`/maps/${mapId}/water_sources`)
    .then((data) => { if (store.mapId === mapId) emit({ sources: data.sources, error: false }) })
    .catch(() => { if (store.mapId === mapId) emit({ error: true }) })
    .finally(() => { if (inflight?.promise === promise) inflight = null })
  inflight = { mapId, promise }
  return promise
}

export function setWaterSources(mapId: number, sources: WaterSource[]) {
  if (store.mapId === mapId) emit({ sources, error: false })
}

/** The water sources of `mapId`, loaded on first use. */
export function useWaterSources(mapId: number) {
  const state = useSyncExternalStore(subscribe, () => store)
  useEffect(() => { void loadWaterSources(mapId) }, [mapId])
  const current = state.mapId === mapId
  return { sources: current ? state.sources : null, error: current && state.error }
}

/** The kinds a water source can feed (WaterSource::LINKABLE_KINDS). */
export const LINKABLE_KINDS = ['tap']

export function isLinkable(feature: MapFeature): boolean {
  return LINKABLE_KINDS.includes(feature.properties.kind)
}

/** The source a feature is linked to, if any. */
export function linkedSourceId(feature: MapFeature): number | null {
  const value = Number(feature.properties.water_source_id)
  return Number.isInteger(value) && value > 0 ? value : null
}
