// The visit under way on each map, kept on the phone so it survives the app
// being closed in a pocket. Closing it goes through the outbox, like a note:
// first the sound of the walk when it was recorded (filed in the documents),
// then the visit itself with its track.
import * as Crypto from 'expo-crypto'
import { useSyncExternalStore } from 'react'
import { outbox } from './outbox'
import { readJson, writeJson } from './storage'
import type { Visit } from './visit-core'
import { visitAudio } from './visitAudio'
import { visitTrack } from './visitTrack'

const FILE = 'visits.json'
let saved: Record<string, Visit> | null = null
const listeners = new Set<() => void>()

const all = () => (saved ??= readJson<Record<string, Visit>>(FILE) ?? {})

function write(next: Record<string, Visit>) {
  saved = next
  writeJson(FILE, saved)
  listeners.forEach((listener) => listener())
}

function patch(mapId: number, change: Partial<Visit>) {
  const visit = visits.get(mapId)
  if (visit) write({ ...all(), [String(mapId)]: { ...visit, ...change } })
}

export type RecordResult = 'started' | 'no_permission' | 'failed'

export const visits = {
  get: (mapId: number): Visit | null => all()[String(mapId)] ?? null,
  start(mapId: number): Visit {
    const visit = { key: Crypto.randomUUID(), startedAt: new Date().toISOString() }
    write({ ...all(), [String(mapId)]: visit })
    return visit
  },

  /** Starts the sound of the walk, or resumes it after a pause. */
  async recordSound(mapId: number): Promise<RecordResult> {
    const visit = visits.get(mapId)
    if (!visit) return 'failed'
    if (visit.audio && visitAudio.state().live) {
      visitAudio.resume()
      return 'started'
    }
    // One recording per visit: one cut short by the app closing is sent as it is.
    if (visit.audio) return 'failed'
    const started = await visitAudio.start()
    if (typeof started === 'string') return started
    patch(mapId, { audio: { file: started.file, startedAt: new Date().toISOString() } })
    return 'started'
  },

  pauseSound: () => visitAudio.pause(),

  /** Starts the track of the walk, or resumes it after a pause. */
  async recordTrack(mapId: number): Promise<RecordResult> {
    const visit = visits.get(mapId)
    if (!visit) return 'failed'
    const started = await visitTrack.start(mapId, visit.key)
    if (started === 'started') patch(mapId, { tracking: true })
    return started
  },

  async pauseTrack(mapId: number) {
    await visitTrack.pause()
    patch(mapId, { tracking: false })
  },

  /** Ends the visit: the server files its report and turns `questionIds` into tasks. */
  async close(mapId: number, questionIds: number[]) {
    const visit = visits.get(mapId)
    if (!visit) return
    const sound = visit.audio ? await visitAudio.finish(visit.audio.file) : null
    const track = await visitTrack.finish(visit.key)
    if (sound) outbox.add({ type: 'uploadVisitAudio', mapId, key: visit.key, startedAt: visit.startedAt, file: sound.file, seconds: sound.seconds })
    outbox.add({ type: 'closeVisit', mapId, key: visit.key, startedAt: visit.startedAt, endedAt: new Date().toISOString(), questionIds, ...(track.length ? { track } : {}) })
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
