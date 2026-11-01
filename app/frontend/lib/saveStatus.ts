// What the person sees in the editor header: is everything I did kept?
// Every write that goes through api() (POST, PATCH, PUT, DELETE) is counted
// here, so the editor's features, panels and sheets all report without wiring.
import { useSyncExternalStore } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'
export type SaveSnapshot = { state: SaveState; savedAt: number | null }

let pending = 0
// A write the server never received (offline, 5xx) stays reported until a
// later write gets through: it is the only kind the person can lose.
let lost = false
let savedAt: number | null = null
let snapshot: SaveSnapshot = { state: 'idle', savedAt: null }
const listeners = new Set<() => void>()

function publish() {
  const state: SaveState = pending > 0 ? 'saving' : lost ? 'failed' : savedAt ? 'saved' : 'idle'
  if (state === snapshot.state && savedAt === snapshot.savedAt) return
  snapshot = { state, savedAt }
  listeners.forEach((listener) => listener())
}

/** A write starts; returns the function that ends it. */
export function trackWrite(): (outcome: 'ok' | 'rejected' | 'lost') => void {
  pending += 1
  publish()
  let done = false
  return (outcome) => {
    if (done) return
    done = true
    pending = Math.max(0, pending - 1)
    if (outcome === 'lost') lost = true
    else {
      // A refused write (422, 409…) says why where it was made; it was not lost.
      if (outcome === 'ok') lost = false
      if (!lost) savedAt = Date.now()
    }
    publish()
  }
}

/** How a finished request counts: received (2xx), refused with a reason (4xx), or lost. */
export function writeOutcome(status: number): 'ok' | 'rejected' | 'lost' {
  if (status >= 200 && status < 300) return 'ok'
  return status >= 400 && status < 500 ? 'rejected' : 'lost'
}

export function saveSnapshot(): SaveSnapshot {
  return snapshot
}

export function pendingWrites(): number {
  return pending
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useSaveStatus(): SaveSnapshot {
  return useSyncExternalStore(subscribe, saveSnapshot, saveSnapshot)
}

/** For tests only. */
export function resetSaveStatus() {
  pending = 0
  lost = false
  savedAt = null
  publish()
}
