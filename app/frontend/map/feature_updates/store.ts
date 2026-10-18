import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { Editor } from '@/map/editor/EditorContext'
import { isDeletion, type FeatureUpdateBatch, type FeatureUpdateData, type FeatureUpdatesResponse, type ProposedChanges } from '@/map/feature_updates/diff'
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

// An accepted deletion put the element in the trash: off the map, and ⌘Z brings it back.
function trashed(editor: Editor, ids: number[]) {
  const features = ids.map((id) => editor.features.find((f) => f.properties.id === id))
  editor.removeFeatures(ids)
  for (const feature of features) if (feature) editor.recordRemoval(feature)
}

export async function acceptUpdate(editor: Editor, id: number, changes?: ProposedChanges) {
  const data = await api<{ id: number; feature?: MapFeature; deletedId?: number }>(`${base(editor.map.id)}/${id}/accept`, {
    method: 'POST', body: changes ? { changes } : undefined,
  })
  if (data.feature) editor.upsertFeatures([data.feature])
  if (data.deletedId != null) trashed(editor, [data.deletedId])
  drop([id])
}

export async function rejectUpdate(editor: Editor, id: number) {
  await api(`${base(editor.map.id)}/${id}/reject`, { method: 'POST' })
  drop([id])
}

/** Accepts the updates of one proposal the person saw. Returns how many applied, and the first failure. */
export async function acceptBatch(editor: Editor, batch: string, ids: number[]) {
  type Answer = { features: MapFeature[]; deletedIds?: number[]; failed: { id: number; message: string }[] }
  const run = async () => {
    const data = await api<Answer>(`${base(editor.map.id)}/accept_all`, { method: 'POST', body: { batch, ids } })
    editor.upsertFeatures(data.features)
    const deleted = data.deletedIds ?? []
    if (deleted.length) trashed(editor, deleted)
    const failed = new Set(data.failed.map((f) => f.id))
    drop(ids.filter((id) => !failed.has(id)))
    return { accepted: data.features.length + deleted.length, deleted: deleted.length, failed: data.failed }
  }
  // Deletions come back in one ⌘Z, like « Tout accepter » for new elements.
  const deletions = state.updates.filter((u) => ids.includes(u.id) && isDeletion(u)).length
  return deletions ? editor.undoGroup(t('undo.labels.delete_all', { count: deletions }), run) : run()
}

export async function rejectBatch(editor: Editor, batch: string, ids: number[]) {
  const data = await api<{ ids: number[] }>(`${base(editor.map.id)}/reject_all`, { method: 'POST', body: { batch, ids } })
  drop(data.ids)
  return data.ids.length
}

export function pendingUpdateFor(featureId: number): FeatureUpdateData | undefined {
  return state.updates.find((u) => u.featureId === featureId)
}
