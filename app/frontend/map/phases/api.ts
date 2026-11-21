import { api } from '@/lib/api'
import type { Editor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'
import { setPhases, type PhasesPayload } from './store'

const base = (editor: Editor) => `/maps/${editor.map.id}/design/phases`

/** Puts the phase in progress away and opens the next one. */
export async function putAwayPhase(editor: Editor, phase: { name: string; notes: string; nextName: string }) {
  const data = await api<PhasesPayload>(base(editor), {
    method: 'POST', body: { phase: { name: phase.name, notes: phase.notes, next_name: phase.nextName } },
  })
  setPhases(editor.map.id, data)
  return data.phases.find((p) => p.id === data.id) ?? null
}

export async function updatePhase(editor: Editor, id: number, patch: { name?: string; notes?: string | null }) {
  setPhases(editor.map.id, await api<PhasesPayload>(`${base(editor)}/${id}`, { method: 'PATCH', body: { phase: patch } }))
}

export async function renameCurrentPhase(editor: Editor, name: string) {
  setPhases(editor.map.id, await api<PhasesPayload>(`/maps/${editor.map.id}/design/phase`, { method: 'PATCH', body: { name } }))
}

export async function deletePhase(editor: Editor, id: number) {
  setPhases(editor.map.id, await api<PhasesPayload>(`${base(editor)}/${id}`, { method: 'DELETE' }))
}

/** A copy of one element of the phase, back on today's map. */
export async function takeFromPhase(editor: Editor, phaseId: number, featureId: number) {
  const data = await api<{ feature: MapFeature }>(`${base(editor)}/${phaseId}/take`, { method: 'POST', body: { feature_id: featureId } })
  editor.upsertFeatures([data.feature])
  return data.feature
}
