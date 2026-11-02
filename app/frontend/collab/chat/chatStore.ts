import { useSyncExternalStore } from 'react'

/**
 * The map's live discussion, shared by the header button, the dock, the
 * « Discussions » panel and the inspector (which steps aside while it is
 * open): whether it shows, how many messages arrived while it was hidden,
 * and a message to bring into view (a pin clicked on the map).
 *
 * Hiding the discussion only hides it: the connection stays open and the
 * messages stay loaded, so showing it again is instant (no reload).
 */
type State = {
  mapId: number | null
  open: boolean
  /** Messages from others that arrived while hidden (or unread on arrival: -1 = some, count unknown). */
  unread: number
  /** A message to scroll to and highlight once shown. */
  focusId: number | null
  /** The discussion steps aside while a spot is picked on the map (a phone has no room for both). */
  picking: boolean
}

let state: State = { mapId: null, open: false, unread: 0, focusId: null, picking: false }
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const storageKey = (mapId: number) => `terranova:chat:${mapId}`

function remember(mapId: number, open: boolean) {
  try {
    window.localStorage.setItem(storageKey(mapId), open ? 'open' : 'closed')
  } catch {
    // Private browsing: the choice lasts for the page only.
  }
}

/** Shown or hidden as the person left it on this map, in this browser. */
export function rememberedOpen(mapId: number): boolean {
  try {
    return window.localStorage.getItem(storageKey(mapId)) === 'open'
  } catch {
    return false
  }
}

export const chatActions = {
  init(mapId: number, open: boolean) {
    if (state.mapId === mapId) return
    // A link opened the discussion before it mounted (an e-mail): keep that.
    const early = state.mapId === null && state.open
    set({ mapId, open: open || early, unread: 0, focusId: early ? state.focusId : null, picking: false })
  },
  setOpen(open: boolean) {
    if (state.mapId != null) remember(state.mapId, open)
    set(open ? { open, unread: 0 } : { open, picking: false })
  },
  toggle() {
    chatActions.setOpen(!state.open)
  },
  /** Opens the discussion on one message (a pin on the map, an e-mail link). */
  focus(id: number | null) {
    if (state.mapId != null) remember(state.mapId, true)
    set({ open: true, unread: 0, focusId: id, picking: false })
  },
  clearFocus() {
    set({ focusId: null })
  },
  arrived() {
    if (!state.open) set({ unread: Math.max(state.unread, 0) + 1 })
  },
  /** Unread messages known from the threads list, count unknown. */
  markSomeUnread() {
    if (!state.open && state.unread === 0) set({ unread: -1 })
  },
  setPicking(picking: boolean) {
    set({ picking })
  },
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useChat(): State {
  return useSyncExternalStore(subscribe, () => state)
}

/** For code outside React (the inspector's layout reads it through useChat). */
export const chatState = () => state
