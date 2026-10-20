import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { elementFor, GENERIC_KINDS } from '@/map/drawing/catalog'
import { useEditor } from '@/map/editor/EditorContext'
import { isPatch, isPlant } from '@/map/plants/properties'
import type { MapFeature } from '@/types'

/** Shapes of ElementFunctions#as_json (GET /maps/:id/functions). */
export type FunctionEntry = {
  key: string
  label: string
  kind: string
  featureIds: number[]
  functions: string[]
  origin: 'own' | 'kind' | 'species'
  needs: string[]
  yields: string[]
  existing: boolean
}
export type FunctionBalance = { function: string; count: number; status: 'missing' | 'fragile' | 'covered'; entries: string[]; existingOnly: boolean }
export type FunctionsResponse = {
  functions: string[]
  enough: number
  entries: FunctionEntry[]
  balance: FunctionBalance[]
  unmetNeeds: { resource: string; entries: string[] }[]
}

/** Whether a feature takes part in the review (mirrors ElementFunctions.applies?). */
export function appliesToFunctions(feature: MapFeature): boolean {
  if (feature.properties.layer === 'notes') return false
  return isPlant(feature) || isPatch(feature) || GENERIC_KINDS.includes(feature.properties.kind) || elementFor(feature.properties.kind)?.functions != null
}

type Store = { mapId: number | null; signature: string | null; data: FunctionsResponse | null; failed: boolean }
let store: Store = { mapId: null, signature: null, data: null, failed: false }
const listeners = new Set<() => void>()
let timer: number | undefined
let controller: AbortController | null = null

function emit(next: Partial<Store>) {
  store = { ...store, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function load(mapId: number, signature: string) {
  if (store.mapId === mapId && store.signature === signature) return
  const first = store.mapId !== mapId
  emit(first ? { mapId, signature, data: null, failed: false } : { signature })
  window.clearTimeout(timer)
  controller?.abort()
  timer = window.setTimeout(() => {
    controller = new AbortController()
    api<FunctionsResponse>(`/maps/${mapId}/functions`, { signal: controller.signal })
      .then((data) => { if (store.mapId === mapId) emit({ data, failed: false }) })
      .catch((error: Error) => { if (error.name !== 'AbortError' && store.mapId === mapId) emit({ failed: true }) })
  }, first ? 0 : 600)
}

/**
 * The functions review of the open map, shared by the « Fonctions » panel
 * and the inspector section; re-read when any feature changes.
 */
export function useElementFunctions() {
  const editor = useEditor()
  const state = useSyncExternalStore(subscribe, () => store)
  const signature = useMemo(
    () => editor.features.map((f) => `${f.properties.id}:${f.properties.lockVersion}:${f.properties.status}`).join(','),
    [editor.features],
  )
  useEffect(() => load(editor.map.id, signature), [editor.map.id, signature])
  const current = state.mapId === editor.map.id
  return { data: current ? state.data : null, failed: current && state.failed }
}

/** The entry a feature counts in (a plant counts with the other plants of its species). */
export function entryFor(data: FunctionsResponse | null, featureId: number): FunctionEntry | null {
  return data?.entries.find((e) => e.featureIds.includes(featureId)) ?? null
}
