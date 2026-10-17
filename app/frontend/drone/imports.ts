import { router } from '@inertiajs/react'
import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { aerialStore } from '@/drone/store'
import { UploadAborted, uploadAerialView } from '@/drone/upload'
import type { AerialImport } from '@/types/drone'

/**
 * The drone views being imported on the open map: the file on its way
 * (only this tab knows it) and the imports the server is preparing. Kept
 * outside the « Couches » panel, so closing the panel stops nothing; the
 * page warns before it is left while a file travels. Once a view is ready
 * the page's props are reloaded and the new view is shown.
 */
export type Sending = { viewId: number | null; filename: string; sent: number; total: number }

export type ImportsState = {
  mapId: number | null
  imports: AerialImport[]
  sending: Sending | null
  error: string | null
}

const POLL_MS = 15_000

let state: ImportsState = { mapId: null, imports: [], sending: null, error: null }
const listeners = new Set<() => void>()
let poll: ReturnType<typeof setTimeout> | null = null
let abort: AbortController | null = null

function set(patch: Partial<ImportsState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function upsert(view: AerialImport) {
  const others = state.imports.filter((v) => v.id !== view.id)
  set({ imports: [view, ...others].sort((a, b) => b.capturedOn.localeCompare(a.capturedOn) || b.id - a.id) })
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = t('drone.import.leave_warning')
}

function schedulePoll() {
  if (poll) clearTimeout(poll)
  poll = null
  if (!state.imports.some((v) => v.status === 'processing')) return
  poll = setTimeout(refresh, POLL_MS)
}

async function refresh() {
  const mapId = state.mapId
  if (mapId == null) return
  try {
    const { aerialViews } = await api<{ aerialViews: AerialImport[] }>(`/maps/${mapId}/aerial_views`)
    if (state.mapId !== mapId) return
    const before = new Map(state.imports.map((v) => [v.id, v.status]))
    const nowReady = aerialViews.filter((v) => v.status === 'ready' && before.get(v.id) === 'processing')
    set({ imports: aerialViews })
    if (nowReady.length > 0) {
      router.reload({ only: ['aerialViews'], onSuccess: () => aerialStore.select(nowReady[0].id) })
    }
  } catch {
    // Offline for a moment: the next round tries again.
  }
  schedulePoll()
}

export const importsStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  init(mapId: number, imports: AerialImport[]) {
    if (state.mapId === mapId && state.sending) return
    set({ mapId, imports, error: state.mapId === mapId ? state.error : null, sending: state.mapId === mapId ? state.sending : null })
    schedulePoll()
  },

  async start(file: File, meta: { name: string; capturedOn: string }): Promise<boolean> {
    const mapId = state.mapId
    if (mapId == null || state.sending) return false
    abort = new AbortController()
    set({ error: null, sending: { viewId: null, filename: file.name, sent: 0, total: file.size } })
    window.addEventListener('beforeunload', onBeforeUnload)
    try {
      const view = await uploadAerialView(mapId, file, meta, {
        signal: abort.signal,
        onCreated: (created) => {
          upsert(created)
          if (state.sending) set({ sending: { ...state.sending, viewId: created.id } })
        },
        onProgress: ({ sent, total }) => {
          if (state.sending) set({ sending: { ...state.sending, sent, total } })
        },
      })
      upsert(view)
      set({ sending: null })
      schedulePoll()
      return true
    } catch (error) {
      const viewId = (state as ImportsState).sending?.viewId
      set({ sending: null, error: error instanceof UploadAborted ? null : error instanceof Error && error.message && !error.message.startsWith('HTTP') ? error.message : t('drone.import.errors.network') })
      // What reached the server is of no use without the rest.
      if (viewId != null) await importsStore.remove(viewId).catch(() => {})
      return false
    } finally {
      window.removeEventListener('beforeunload', onBeforeUnload)
      abort = null
    }
  },

  cancel() {
    abort?.abort()
  },

  async remove(viewId: number) {
    const mapId = state.mapId
    if (mapId == null) return
    const { aerialViews } = await api<{ aerialViews: AerialImport[] }>(`/maps/${mapId}/aerial_views/${viewId}`, { method: 'DELETE' })
    const wasShown = state.imports.find((v) => v.id === viewId)?.status === 'ready'
    set({ imports: aerialViews })
    if (wasShown) router.reload({ only: ['aerialViews'] })
  },

  clearError() {
    set({ error: null })
  },
}

export function useImports(): ImportsState {
  return useSyncExternalStore(importsStore.subscribe, importsStore.get, importsStore.get)
}
