import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { Editor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'

// Review of AI drafts, shared by the drafts bar and the inspector section.
// The server endpoints live in Maps::DraftsController.
const base = (editor: Editor) => `/maps/${editor.map.id}/drafts`

// Each review can be undone (⌘Z): the element becomes a draft again.
const draftOf = (editor: Editor, id: number) => editor.features.find((f) => f.properties.id === id)

export async function acceptDraft(editor: Editor, id: number) {
  const draft = draftOf(editor, id)
  const feature = await api<MapFeature>(`${base(editor)}/${id}/accept`, { method: 'POST' })
  editor.upsertFeatures([feature])
  if (draft) editor.recordDraftReview(draft, 'accept', feature)
  return feature
}

export async function rejectDraft(editor: Editor, id: number) {
  const draft = draftOf(editor, id)
  await api(`${base(editor)}/${id}/reject`, { method: 'POST' })
  editor.removeFeatures([id])
  if (draft) editor.recordDraftReview(draft, 'reject')
}

export async function acceptDrafts(editor: Editor, ids: number[]) {
  return editor.undoGroup(t('undo.labels.accept_all', { count: ids.length }), async () => {
    const drafts = new Map(ids.map((id) => [id, draftOf(editor, id)]))
    const data = await api<{ features: MapFeature[] }>(`${base(editor)}/accept_all`, { method: 'POST', body: { ids } })
    editor.upsertFeatures(data.features)
    for (const feature of data.features) {
      const draft = drafts.get(feature.properties.id)
      if (draft) editor.recordDraftReview(draft, 'accept', feature)
    }
    return data.features.length
  })
}

export async function rejectDrafts(editor: Editor, ids: number[]) {
  return editor.undoGroup(t('undo.labels.reject_all', { count: ids.length }), async () => {
    const drafts = new Map(ids.map((id) => [id, draftOf(editor, id)]))
    const data = await api<{ ids: number[] }>(`${base(editor)}/reject_all`, { method: 'POST', body: { ids } })
    editor.removeFeatures(data.ids)
    for (const id of data.ids) {
      const draft = drafts.get(id)
      if (draft) editor.recordDraftReview(draft, 'reject')
    }
    return data.ids.length
  })
}
