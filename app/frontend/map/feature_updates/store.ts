import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { Editor } from '@/map/editor/EditorContext'
import type { FeatureUpdateBatch, FeatureUpdateData, FeatureUpdatesResponse, ProposedChanges } from '@/map/feature_updates/diff'
import type { MapFeature } from '@/types'

/**
 * Changes an AI proposed to elements already on the open map, waiting for
 * review. Shared by the review bar, the inspector section and the map
 * highlight, which live in different parts of the editor.
 */
type State = { mapId: number | null; updates: FeatureUpdateData[]; batches: FeatureUpdateBatch[]; loaded: boolean }

let state: State = { mapId: null, updates: [], batches: [], loaded: false }
const listeners = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useFeatureUpdates(): State {
  return useSyncExternalStore(subscribe, () => state)
}

const base = (mapId: number) => `/maps/${mapId}/feature_updates`

export async function loadFeatureUpdates(mapId: number) {
  if (state.mapId !== mapId) set({ mapId, updates: [], batches: [], loaded: false })
  const data = await api<FeatureUpdatesResponse>(base(mapId))
  if (state.mapId === mapId) set({ updates: data.updates, batches: data.batches, loaded: true })
}

/** Removes reviewed updates from the list (and batches left empty). */
function drop(ids: number[]) {
  const gone = new Set(ids)
  const updates = state.updates.filter((u) => !gone.has(u.id))
  const batches = state.batches
    .map((b) => ({ ...b, count: updates.filter((u) => u.batch === b.batch).length }))
    .filter((b) => b.count > 0)
  set({ updates, batches })
}

export async function acceptUpdate(editor: Editor, id: number, changes?: ProposedChanges) {
  const data = await api<{ id: number; feature: MapFeature }>(`${base(editor.map.id)}/${id}/accept`, {
    method: 'POST', body: changes ? { changes } : undefined,
  })
  editor.upsertFeatures([data.feature])
  drop([id])
}

export async function rejectUpdate(editor: Editor, id: number) {
  await api(`${base(editor.map.id)}/${id}/reject`, { method: 'POST' })
  drop([id])
}

/** Accepts the updates of one proposal the person saw. Returns how many applied, and the first failure. */
export async function acceptBatch(editor: Editor, batch: string, ids: number[]) {
  const data = await api<{ features: MapFeature[]; failed: { id: number; message: string }[] }>(`${base(editor.map.id)}/accept_all`, {
    method: 'POST', body: { batch, ids },
  })
  editor.upsertFeatures(data.features)
  const failed = new Set(data.failed.map((f) => f.id))
  drop(ids.filter((id) => !failed.has(id)))
  return { accepted: data.features.length, failed: data.failed }
}

export async function rejectBatch(editor: Editor, batch: string, ids: number[]) {
  const data = await api<{ ids: number[] }>(`${base(editor.map.id)}/reject_all`, { method: 'POST', body: { batch, ids } })
  drop(data.ids)
  return data.ids.length
}

export function pendingUpdateFor(featureId: number): FeatureUpdateData | undefined {
  return state.updates.find((u) => u.featureId === featureId)
}
