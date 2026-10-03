import { api } from '@/lib/api'
import type { Editor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'

// Review of AI drafts, shared by the drafts bar and the inspector section.
// The server endpoints live in Maps::DraftsController.
const base = (editor: Editor) => `/maps/${editor.map.id}/drafts`

export async function acceptDraft(editor: Editor, id: number) {
  const feature = await api<MapFeature>(`${base(editor)}/${id}/accept`, { method: 'POST' })
  editor.upsertFeatures([feature])
  return feature
}

export async function rejectDraft(editor: Editor, id: number) {
  await api(`${base(editor)}/${id}/reject`, { method: 'POST' })
  editor.removeFeatures([id])
}

export async function acceptDrafts(editor: Editor, ids: number[]) {
  const data = await api<{ features: MapFeature[] }>(`${base(editor)}/accept_all`, { method: 'POST', body: { ids } })
  editor.upsertFeatures(data.features)
  return data.features.length
}

export async function rejectDrafts(editor: Editor, ids: number[]) {
  const data = await api<{ ids: number[] }>(`${base(editor)}/reject_all`, { method: 'POST', body: { ids } })
  editor.removeFeatures(data.ids)
  return data.ids.length
}
