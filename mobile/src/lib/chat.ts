// The map's live discussion on the phone: one store per open map, kept
// while the terrain screen is open. The discussion screen only shows it:
// closing it (a swipe down) leaves the connection open and the messages
// loaded, so opening it again is instant, without reloading.
//
// The server announces each change on MapChatChannel (`{ type, id }`,
// never the content); the app then reads that message through the comments
// API, with its own rights. Sending goes through the outbox (lib/outbox.ts),
// so a message written where the signal drops leaves as soon as it is back.
import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'
import { subscribe } from './cable'
import { removeMessage, unreadSince, upsertMessage, type ChatMember, type ChatMessage, type ChatThread } from './chat-core'
import type { Position } from './types'

export type ChatState = {
  mapId: number | null
  status: 'idle' | 'loading' | 'ready' | 'failed' | 'closed'
  messages: ChatMessage[]
  members: ChatMember[]
  /** Connected to the live channel (else the list is as of the last load). */
  live: boolean
  /** Messages from others since the discussion was last shown (-1: some, count unknown). */
  unread: number
  visible: boolean
  /** A message to bring into view and highlight once shown (a pin tapped on the map). */
  focusId: number | null
}

/** What the discussion asks the map to show when one taps a pin or a cited element. */
export type MapFocus = { kind: 'spot'; position: Position; messageId: number } | { kind: 'feature'; id: number }

const empty: ChatState = { mapId: null, status: 'idle', messages: [], members: [], live: false, unread: 0, visible: false, focusId: null }
let state: ChatState = empty
const listeners = new Set<() => void>()
const focusListeners = new Set<(focus: MapFocus) => void>()
let unsubscribe: (() => void) | null = null
let readTimer: ReturnType<typeof setTimeout> | null = null

function set(patch: Partial<ChatState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const base = (mapId: number) => `/maps/${mapId}/comments`

/**
 * Reads the discussion. A peek (the terrain screen opening) leaves it
 * unread on the server and counts what came from others since the last
 * read; a plain load (the discussion shown) marks it read.
 */
async function load(mapId: number, { quiet = false, peek = false } = {}) {
  if (!quiet) set({ status: state.status === 'ready' ? 'ready' : 'loading' })
  try {
    const thread = await api<ChatThread>('GET', `${base(mapId)}?commentable_type=Map&commentable_id=${mapId}${peek ? '&peek=1' : ''}`)
    if (state.mapId !== mapId) return
    const patch: Partial<ChatState> = { status: 'ready', messages: thread.comments, members: thread.members }
    if (peek && !state.visible) patch.unread = unreadSince(thread.comments, thread.lastReadAt)
    set(patch)
  } catch (error) {
    if (state.mapId !== mapId) return
    if (error instanceof ApiError && error.status === 403) set({ status: 'closed' })
    else if (state.status !== 'ready') set({ status: 'failed' })
  }
}

function markRead(mapId: number) {
  if (readTimer) clearTimeout(readTimer)
  readTimer = setTimeout(() => {
    readTimer = null
    void api('POST', `${base(mapId)}/read`, { commentable_type: 'Map', commentable_id: mapId }).catch(() => undefined)
  }, 800)
}

async function arrived(mapId: number, id: number) {
  try {
    const message = await api<ChatMessage>('GET', `${base(mapId)}/${id}`)
    if (state.mapId !== mapId) return
    const known = state.messages.some((m) => m.id === id)
    set({ messages: upsertMessage(state.messages, message) })
    if (known || message.canEdit) return
    if (state.visible) markRead(mapId)
    else set({ unread: Math.max(state.unread, 0) + 1 })
  } catch {
    // Deleted meanwhile, or the network dropped: the next load catches up.
  }
}

export const chat = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  /** While the terrain screen of a map one takes part in is open: live, and knows what is unread. */
  attach(mapId: number): () => void {
    if (state.mapId !== mapId) {
      unsubscribe?.()
      state = { ...empty, mapId }
      listeners.forEach((l) => l())
    }
    // Loaded at once, for the pins on the map and what is unread.
    if (state.status !== 'ready') void load(mapId, { quiet: true, peek: true })
    let connectedOnce = false
    const off = subscribe({ channel: 'MapChatChannel', map_id: mapId }, {
      connected: () => {
        set({ live: true })
        // Back after a cut: what was said meanwhile.
        if (connectedOnce && state.status === 'ready') void load(mapId, { quiet: true, peek: !state.visible })
        connectedOnce = true
      },
      disconnected: () => { if (state.mapId === mapId) set({ live: false }) },
      rejected: () => set({ live: false, status: 'closed' }),
      received: (raw) => {
        const message = raw as { type?: string; id?: number }
        if (typeof message.id !== 'number') return
        if (message.type === 'delete') set({ messages: removeMessage(state.messages, message.id) })
        else void arrived(mapId, message.id)
      },
    })
    unsubscribe = off
    return () => {
      if (unsubscribe !== off) return
      off()
      unsubscribe = null
      state = empty
      listeners.forEach((l) => l())
    }
  },

  /** The discussion screen shows: loaded the first time, then only marked read. */
  show(mapId: number) {
    if (state.mapId !== mapId) state = { ...empty, mapId }
    set({ visible: true, unread: 0 })
    if (state.status === 'ready') markRead(mapId)
    else void load(mapId)
  },
  hide() {
    set({ visible: false, focusId: null })
  },
  /** Before opening the discussion on one message. */
  openAt(id: number) {
    set({ focusId: id })
  },
  clearFocus() {
    set({ focusId: null })
  },
  reload(mapId: number) {
    void load(mapId)
  },

  /** A message the server just took (the outbox's answer): shown even if the live channel is down. */
  received(mapId: number, message: ChatMessage) {
    if (state.mapId === mapId) set({ messages: upsertMessage(state.messages, message) })
  },

  async remove(mapId: number, id: number) {
    await api('DELETE', `${base(mapId)}/${id}`)
    set({ messages: removeMessage(state.messages, id) })
  },

  /** Asks the terrain screen to show a spot or an element (the discussion closes over it). */
  focusMap(next: MapFocus) {
    focusListeners.forEach((l) => l(next))
  },
  onFocus(listener: (focus: MapFocus) => void) {
    focusListeners.add(listener)
    return () => { focusListeners.delete(listener) }
  },
}

export function useChat(): ChatState {
  return useSyncExternalStore(chat.subscribe, chat.get)
}
