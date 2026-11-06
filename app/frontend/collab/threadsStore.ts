import { useEffect, useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type { ThreadSummary } from '@/types/collab'
import { readThreadList } from './threadsPayload'

/**
 * The map's discussions at a glance (counts, previews, unread flags), shared
 * by the Discussions panel, the unread dot on its icon, the comment badges
 * on the map and the inspector: any of them can refresh it after a change.
 */
type State = { mapId: number | null; threads: ThreadSummary[]; commentEmails: boolean; loaded: boolean }

let state: State = { mapId: null, threads: [], commentEmails: true, loaded: false }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

export async function refreshThreads(mapId: number): Promise<void> {
  if (state.mapId !== mapId) set({ mapId, threads: [], commentEmails: true, loaded: false })
  inflight ??= api<unknown>(`/maps/${mapId}/comments/threads`)
    .then((data) => {
      const list = readThreadList(data)
      if (list) set({ mapId, ...list, loaded: true })
    })
    .catch(() => undefined) // a failed refresh keeps the last known list
    .finally(() => { inflight = null })
  return inflight
}

export function setCommentEmails(value: boolean) {
  set({ ...state, commentEmails: value })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Threads of a map; refreshes on mount and every minute while visible. */
export function useThreads(mapId: number) {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    void refreshThreads(mapId)
    const timer = window.setInterval(() => { if (!document.hidden) void refreshThreads(mapId) }, 60_000)
    return () => window.clearInterval(timer)
  }, [mapId])
  const own = snapshot.mapId === mapId
  return {
    threads: own ? snapshot.threads : [],
    commentEmails: own ? snapshot.commentEmails : true,
    loaded: own && snapshot.loaded,
    refresh: () => refreshThreads(mapId),
  }
}
