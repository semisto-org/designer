// The outbox bound to the phone: saved in outbox.json, sent through api().
import * as Crypto from 'expo-crypto'
import { api, form } from './api'
import { chat } from './chat'
import type { ChatMessage } from './chat-core'
import { storageReadingBody } from './fruitStore'
import { harvestBody } from './harvests'
import { emptyOutbox, filesOf, flush, nextTempId, retry, retryDelayMs, type FlushResult, type NewFeature, type NewTimeEntry, type Op, type OutboxState, type Transport } from './outbox-core'
import { mediaFile } from './media'
import { report } from './monitoring'
import { deletePhoto, keptFile, readJson, writeJson } from './storage'
import type { MapFeature } from './types'

const FILE = 'outbox.json'
let state: OutboxState = readJson<OutboxState>(FILE) ?? emptyOutbox()
/** How the last round of sending ended, for « Envois ». */
export type SendRun = { at: string; sent: number; stopped: FlushResult['stopped']; blocked?: FlushResult['blocked'] }
/** The round being sent, for « Envois » and the map's status: n of N, and which change. */
export type SendProgress = {
  total: number
  done: number
  current: Op | null
  /** The file of the current change, as it leaves the phone. */
  bytes?: { sent: number; total: number }
  /** Last sign of life (a change started, bytes sent): « Envois » offers to start again when it is old. */
  activeAt: number
}
let flushing: Promise<SendRun> | null = null
let progress: SendProgress | null = null
const progressListeners = new Set<() => void>()
function setProgress(next: SendProgress | null) {
  progress = next
  progressListeners.forEach((listener) => listener())
}
let lastRun: SendRun | null = null
// A round stopped by the network or the server is tried again on a timer.
let retryTimer: ReturnType<typeof setTimeout> | null = null
let failures = 0
const listeners = new Set<(state: OutboxState) => void>()

function commit(next: OutboxState) {
  state = next
  writeJson(FILE, state)
  listeners.forEach((listener) => listener(state))
}

export const outbox = {
  get: () => state,
  subscribe(listener: (state: OutboxState) => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  /** Queues a change; returns the temp id for a new feature. */
  add(op: DistributiveOmit<Op, 'id' | 'createdAt'>): Op {
    const full = { ...op, id: Crypto.randomUUID(), createdAt: new Date().toISOString() } as Op
    commit({ ...state, ops: [...state.ops, full] })
    void outbox.flush()
    return full
  },

  addFeature(mapId: number, feature: NewFeature): number {
    const tempId = nextTempId(state)
    outbox.add({ type: 'createFeature', mapId, tempId, feature })
    return tempId
  },

  /** Drops a change the server refused. */
  discard(id: string) {
    const op = state.ops.find((o) => o.id === id)
    if (op) filesOf(op).forEach(deletePhoto)
    commit({ ...state, ops: state.ops.filter((o) => o.id !== id) })
  },

  /** Sends a refused change again (after signing in again, or fixing the cause on the website). */
  retry(id: string) {
    commit(retry(state, id))
    void outbox.flush()
  },

  pending: (mapId?: number) => state.ops.filter((op) => !op.error && (mapId === undefined || op.mapId === mapId)).length,
  failed: (mapId?: number) => state.ops.filter((op) => op.error && (mapId === undefined || op.mapId === mapId)),

  lastRun: () => lastRun,
  progress: () => progress,
  subscribeProgress(listener: () => void) {
    progressListeners.add(listener)
    return () => { progressListeners.delete(listener) }
  },

  /**
   * « Relancer l'envoi »: cancels a file that stopped moving and sends again
   * at once (the server answers a resend of the same change with its first
   * answer, so nothing arrives twice).
   */
  async restart(): Promise<SendRun> {
    activeUpload?.abort()
    if (flushing) await flushing.catch(() => undefined)
    failures = 0
    return outbox.flush()
  },

  /** Sends what is waiting; resolves with how the round ended. */
  flush(): Promise<SendRun> {
    flushing ??= (async () => {
      try {
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
        let sent = 0
        let stopped: FlushResult['stopped'] = 'done'
        let blocked: FlushResult['blocked']
        if (outbox.pending() > 0) setProgress({ total: outbox.pending(), done: 0, current: null, activeAt: Date.now() })
        // Ops added while sending go in the next round.
        for (let round = 0; round < 5 && outbox.pending() > 0; round++) {
          const snapshot = state
          const inRun = new Set(snapshot.ops.map((o) => o.id))
          // Saved after every change sent: if the app is killed mid-round,
          // nothing already sent goes out twice.
          const save = (next: OutboxState, files: string[]) => {
            // Ops queued while sending stay after the ones of this run.
            commit({
              ids: { ...state.ids, ...next.ids },
              ops: [...next.ops, ...state.ops.filter((o) => !inRun.has(o.id))],
            })
            files.forEach(deletePhoto)
          }
          // n of N: the changes already gone out, then this one; queued ones join N.
          let processed = 0
          const result = await flush(snapshot, transport, save, (op) => {
            const done = sent + processed++
            setProgress({ total: done + outbox.pending(), done, current: op, activeAt: Date.now() })
          })
          save(result.state, [])
          sent += result.sent
          stopped = result.stopped
          blocked = result.blocked
          if (stopped !== 'done') break
        }
        // An expired session waits for the next sign-in (onAuthChange).
        if ((stopped === 'offline' || stopped === 'server') && outbox.pending() > 0) {
          failures += 1
          retryTimer = setTimeout(() => { retryTimer = null; void outbox.flush() }, retryDelayMs(failures))
        } else {
          failures = 0
        }
        if (blocked) report(new Error(`outbox stopped (${stopped}): ${blocked.reason}`), { op: state.ops.find((o) => o.id === blocked.id)?.type })
        setProgress(null)
        lastRun = { at: new Date().toISOString(), sent, stopped, blocked }
        listeners.forEach((listener) => listener(state))
        return lastRun
      } finally {
        if (progress) setProgress(null)
        flushing = null
      }
    })()
    return flushing
  },
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

// A photo the phone no longer has is set aside with its reason, instead of
// failing like a network error and holding back every change after it.
const present = (uri: string) => {
  const kept = keptFile(uri)
  if (!kept) throw { status: 410, message: 'file_missing' }
  return kept
}
const photoFile = (uri: string) => ({ uri: present(uri), name: 'photo.jpg', type: 'image/jpeg' })
const once = (key: string) => ({ idempotencyKey: key })

// The file being sent: its bytes feed « Envois », and « Relancer l'envoi » cancels it.
let activeUpload: AbortController | null = null
const upload = (key: string) => {
  const controller = new AbortController()
  activeUpload = controller
  return {
    ...once(key), signal: controller.signal,
    onProgress: (sent: number, total: number) => {
      if (progress) setProgress({ ...progress, bytes: { sent, total }, activeAt: Date.now() })
    },
  }
}

const transport: Transport = {
  createFeature: (mapId, feature, key) => api<MapFeature>('POST', `/maps/${mapId}/features`, { feature }, once(key)),
  updateFeature: (mapId, featureId, body) => api<MapFeature>('PATCH', `/maps/${mapId}/features/${featureId}`, { feature: body }),
  async uploadPhoto(mapId, op, featureId, key) {
    const located = op.lng !== null && op.lat !== null
    await api('POST', `/maps/${mapId}/photos`, form('photo', {
      image: mediaFile(present(op.file)), taken_at: op.takenAt, caption: op.caption, source: 'phone',
      lng: op.lng, lat: op.lat, location_source: located ? 'device' : null, map_feature_id: featureId,
      bioindicator_status: op.bioindicatorStatus ?? null, heading: op.heading ?? null, retake_of_id: op.retakeOf ?? null,
      soil_sample_id: op.soilSampleId ?? null,
    }), upload(key))
  },
  async createObservation(mapId, featureId, op, key) {
    await api('POST', `/maps/${mapId}/features/${featureId}/plant_observations`, form('plant_observation', {
      observed_on: op.observedOn, kind: op.kind ?? 'follow_up', survival: op.survival, vigor: op.vigor, note: op.note,
      photo: op.photo ? photoFile(op.photo) : null,
    }), op.photo ? upload(key) : once(key))
  },
  async createHarvest(mapId, featureId, harvest, key) {
    await api('POST', `/maps/${mapId}/features/${featureId}/plant_harvests`, harvestBody(harvest), once(key))
  },
  async createStorageReading(mapId, featureId, reading, key) {
    await api('POST', `/maps/${mapId}/features/${featureId}/storage_readings`, storageReadingBody(reading), once(key))
  },
  async createBioindicator(mapId, { observation: o, photo }, key) {
    const located = o.lng !== null && o.lat !== null
    await api('POST', `/maps/${mapId}/bioindicator_observations`, form('bioindicator_observation', {
      species_name: o.speciesName, latin_name: o.latinName, catalog_key: o.catalogKey, plant_species_id: o.plantSpeciesId,
      abundance: o.abundance, cover_percent: o.coverPercent ?? null, notes: o.notes, lng: o.lng, lat: o.lat, location_source: located ? 'device' : null,
      photo_taken_at: o.takenAt, photo_source: 'phone', photo: photoFile(photo),
    }), upload(key))
  },
  async createComment(mapId, featureId, body, key) {
    await api('POST', `/maps/${mapId}/comments`, {
      comment: { body, ...(featureId ? { commentable_type: 'MapFeature', commentable_id: featureId } : {}) },
    }, once(key))
  },
  // The photo first (the server takes it among the map's photos), then the
  // message pointing at it; each step has its own key, so a retry after a
  // lost answer gets the first photo back instead of a second one.
  async chatMessage(mapId, op, featureIds, key) {
    let photoId: number | null = null
    if (op.photo) {
      const located = op.lng !== null && op.lat !== null
      const photo = await api<{ id: number }>('POST', `/maps/${mapId}/photos`, form('photo', {
        image: mediaFile(present(op.photo)), taken_at: op.takenAt, source: 'phone',
        lng: op.lng, lat: op.lat, location_source: located ? 'device' : null, heading: op.heading ?? null,
      }), once(`${key}:photo`))
      photoId = photo.id
    }
    const message = await api<ChatMessage>('POST', `/maps/${mapId}/comments`, {
      comment: {
        body: op.body, commentable_type: 'Map', commentable_id: mapId, feature_ids: featureIds,
        ...(op.lng !== null && op.lat !== null ? { lng: op.lng, lat: op.lat } : {}), ...(photoId ? { map_photo_id: photoId } : {}),
      },
    }, once(key))
    if (message?.id) chat.received(mapId, message)
  },
  async closeVisit(mapId, op, questionIds, key) {
    await api('POST', `/maps/${mapId}/site_visits`, {
      site_visit: { key: op.key, started_at: op.startedAt, ended_at: op.endedAt, question_ids: questionIds, ...(op.track?.length ? { track: op.track } : {}) },
    }, once(key))
  },
  async createTimeEntry(mapId, entry, key) {
    await api('POST', '/time_entries', { source: 'app', time_entry: timeEntryBody(mapId, entry) }, once(key))
  },
  // An hour of speech weighs about 30 MB: like a video, it is given up only when it stops moving.
  async uploadVisitAudio(mapId, op, key) {
    await api('POST', `/maps/${mapId}/site_visits/${encodeURIComponent(op.key)}/audio`, form('site_visit', {
      audio: { uri: present(op.file), name: 'visite.m4a', type: 'audio/mp4' }, started_at: op.startedAt, seconds: op.seconds,
    }), upload(key))
  },
}

/** A line of hours as POST /time_entries takes it: billable, the server picks its recipient. */
export function timeEntryBody(mapId: number, entry: NewTimeEntry) {
  return {
    map_id: mapId, worked_on: entry.workedOn, minutes: entry.minutes, phase: entry.phase, billable: true, note: entry.note,
    ...(entry.tripKm ? { trip_km: entry.tripKm, trip_from: entry.tripFrom, trip_to: entry.tripTo } : {}),
  }
}
