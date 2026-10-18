// The visit under way on each map, kept on the phone so it survives the app
// being closed in a pocket. Closing it goes through the outbox, like a note.
import * as Crypto from 'expo-crypto'
import { useSyncExternalStore } from 'react'
import { outbox } from './outbox'
import { readJson, writeJson } from './storage'
import type { Visit } from './visit-core'

const FILE = 'visits.json'
let saved: Record<string, Visit> | null = null
const listeners = new Set<() => void>()

const all = () => (saved ??= readJson<Record<string, Visit>>(FILE) ?? {})

function write(next: Record<string, Visit>) {
  saved = next
  writeJson(FILE, saved)
  listeners.forEach((listener) => listener())
}

export const visits = {
  get: (mapId: number): Visit | null => all()[String(mapId)] ?? null,
  start(mapId: number): Visit {
    const visit = { key: Crypto.randomUUID(), startedAt: new Date().toISOString() }
    write({ ...all(), [String(mapId)]: visit })
    return visit
  },
  /** Ends the visit: the server files its report and turns `questionIds` into tasks. */
  close(mapId: number, questionIds: number[]) {
    const visit = visits.get(mapId)
    if (!visit) return
    outbox.add({ type: 'closeVisit', mapId, key: visit.key, startedAt: visit.startedAt, endedAt: new Date().toISOString(), questionIds })
    const { [String(mapId)]: _closed, ...rest } = all()
    write(rest)
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}

export function useVisit(mapId: number): Visit | null {
  return useSyncExternalStore(visits.subscribe, () => visits.get(mapId))
}
