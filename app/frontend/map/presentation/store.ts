import { useSyncExternalStore } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Presentation, PresentationStep, PresentationsPayload, PresentationTemplateInfo, PresentationView } from './types'

/**
 * The map's « Présenter » sequence, shared by the panel and the presenting
 * bar: the presentation (one per map in the editor for now), the templates,
 * the step last shown and whether the editor is presenting full screen.
 * Steps are saved whole, one save after the other, each with the lock
 * version the previous one returned.
 */
type State = {
  mapId: number | null
  loaded: boolean
  presentation: Presentation | null
  templates: PresentationTemplateInfo[]
  /** Id of the step whose view was shown last. */
  currentId: string | null
  presenting: boolean
  /** The viewer's own view before presenting, given back at the end. */
  before: PresentationView | null
  error: string | null
}

let state: State = { mapId: null, loaded: false, presentation: null, templates: [], currentId: null, presenting: false, before: null, error: null }
const listeners = new Set<() => void>()
let queue: Promise<unknown> = Promise.resolve()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export const presentationStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function usePresentation<T>(select: (s: State) => T): T {
  return useSyncExternalStore(presentationStore.subscribe, () => select(state))
}

const base = (mapId: number) => `/maps/${mapId}/presentations`

function receive(data: PresentationsPayload) {
  set({ loaded: true, presentation: data.presentations[0] ?? null, templates: data.templates, error: null })
}

/** Loads the map's presentation once per map. */
export async function loadPresentation(mapId: number) {
  if (state.mapId === mapId && state.loaded) return
  state = { ...state, mapId, loaded: false, presentation: null, currentId: null }
  try {
    receive(await api<PresentationsPayload>(base(mapId)))
  } catch {
    set({ loaded: true })
  }
}

export async function startPresentation(mapId: number, template: string | null) {
  const data = await api<PresentationsPayload>(base(mapId), { method: 'POST', body: template ? { template } : {} })
  receive(data)
}

export async function deletePresentation() {
  const { mapId, presentation } = state
  if (mapId == null || !presentation) return
  receive(await api<PresentationsPayload>(`${base(mapId)}/${presentation.id}`, { method: 'DELETE' }))
}

/**
 * Shows the new steps at once and saves them after the saves already on
 * their way. A conflict brings back the presentation as it stands.
 */
export function saveSteps(steps: PresentationStep[], onError: (message: string, stale: boolean) => void) {
  const { mapId, presentation } = state
  if (mapId == null || !presentation) return
  set({ presentation: { ...presentation, steps } })
  queue = queue.then(async () => {
    const current = state.presentation
    if (!current || current.id !== presentation.id) return
    try {
      const data = await api<PresentationsPayload>(`${base(mapId)}/${current.id}`, {
        method: 'PATCH',
        body: { presentation: { steps: current.steps, lock_version: current.lockVersion } },
      })
      const saved = data.presentations.find((p) => p.id === current.id)
      // Keep what was changed meanwhile; take the new lock version.
      if (saved && state.presentation?.id === saved.id) set({ presentation: { ...state.presentation, lockVersion: saved.lockVersion } })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        receive(error.data as unknown as PresentationsPayload)
        onError(String(error.data.message ?? ''), true)
      } else {
        onError(error instanceof Error ? error.message : '', false)
      }
    }
  })
}

export function setCurrentStep(id: string | null) {
  set({ currentId: id })
}

export function setPresenting(presenting: boolean, before: PresentationView | null = null) {
  set({ presenting, before: presenting ? before : null })
}

export const shownSteps = (presentation: Presentation | null) => presentation?.steps.filter((s) => s.shown) ?? []

/** A new step id, unique enough within one presentation. */
export const newStepId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
