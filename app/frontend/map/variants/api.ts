import { api } from '@/lib/api'
import type { Editor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'
import { setVariants, showVariant } from './store'
import type { MapVariant } from './variants'

type Payload = { variants: MapVariant[]; id?: number; features?: MapFeature[]; trashed?: number[] }

const base = (editor: Editor) => `/maps/${editor.map.id}/variants`

/**
 * A new variant, shown at once. On a map without variants the server
 * first makes « Projet 1 » of the project as it stands. `fromTag`: the
 * planned elements carrying that tag join it (the former « Version »).
 */
export async function createVariant(editor: Editor, options: { name?: string; fromTag?: string } = {}) {
  const data = await api<Payload>(base(editor), {
    method: 'POST', body: { variant: { name: options.name ?? '' }, from_tag: options.fromTag ?? null },
  })
  setVariants(data.variants)
  if (data.id) showVariant(data.id)
  if (options.fromTag) await editor.reloadFeatures()
  return data.variants.find((v) => v.id === data.id) ?? null
}

export async function updateVariant(editor: Editor, id: number, patch: { name?: string; notes?: string | null; retained?: boolean }) {
  const data = await api<Payload>(`${base(editor)}/${id}`, { method: 'PATCH', body: { variant: patch } })
  setVariants(data.variants)
  return data.variants.find((v) => v.id === id) ?? null
}

/** A copy of the variant and of its own elements, shown at once. */
export async function duplicateVariant(editor: Editor, id: number) {
  const data = await api<Payload>(`${base(editor)}/${id}/duplicate`, { method: 'POST' })
  setVariants(data.variants)
  if (data.features?.length) editor.upsertFeatures(data.features)
  if (data.id) showVariant(data.id)
  return data.variants.find((v) => v.id === data.id) ?? null
}

/** Deletes the variant; its own elements go to the trash. */
export async function deleteVariant(editor: Editor, id: number) {
  const data = await api<Payload>(`${base(editor)}/${id}`, { method: 'DELETE' })
  setVariants(data.variants)
  if (data.trashed?.length) editor.removeFeatures(data.trashed)
  showVariant(null)
}
