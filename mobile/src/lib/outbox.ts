// The outbox bound to the phone: saved in outbox.json, sent through api().
import * as Crypto from 'expo-crypto'
import { api, form } from './api'
import { storageReadingBody } from './fruitStore'
import { harvestBody } from './harvests'
import { emptyOutbox, filesOf, flush, nextTempId, retry, retryDelayMs, type FlushResult, type NewFeature, type Op, type OutboxState, type Transport } from './outbox-core'
import { isVideo, mediaFile } from './media'
import { deletePhoto, readJson, writeJson } from './storage'
import type { MapFeature } from './types'

const FILE = 'outbox.json'
let state: OutboxState = readJson<OutboxState>(FILE) ?? emptyOutbox()
let flushing: Promise<number> | null = null
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

  /** Sends what is waiting; resolves with the number of changes sent. */
  flush(): Promise<number> {
    flushing ??= (async () => {
      try {
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
        let sent = 0
        let stopped: FlushResult['stopped'] = 'done'
        // Ops added while sending go in the next round.
        for (let round = 0; round < 5 && outbox.pending() > 0; round++) {
          const snapshot = state
          const inRun = new Set(snapshot.ops.map((o) => o.id))
          // Saved after every change sent: if the app is killed mid-round,
          // nothing already sent goes out twice.
          const save = (progress: OutboxState, files: string[]) => {
            // Ops queued while sending stay after the ones of this run.
            commit({
              ids: { ...state.ids, ...progress.ids },
              ops: [...progress.ops, ...state.ops.filter((o) => !inRun.has(o.id))],
            })
            files.forEach(deletePhoto)
          }
          const result = await flush(snapshot, transport, save)
          save(result.state, [])
          sent += result.sent
          stopped = result.stopped
          if (stopped !== 'done') break
        }
        // An expired session waits for the next sign-in (onAuthChange).
        if ((stopped === 'offline' || stopped === 'server') && outbox.pending() > 0) {
          failures += 1
          retryTimer = setTimeout(() => { retryTimer = null; void outbox.flush() }, retryDelayMs(failures))
        } else {
          failures = 0
        }
        return sent
      } finally {
        flushing = null
      }
    })()
    return flushing
  },
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

const photoFile = (uri: string) => ({ uri, name: 'photo.jpg', type: 'image/jpeg' })
// A video can weigh hundreds of megabytes on a field connection.
const VIDEO_TIMEOUT_MS = 30 * 60_000

const once = (key: string) => ({ idempotencyKey: key })

const transport: Transport = {
  createFeature: (mapId, feature, key) => api<MapFeature>('POST', `/maps/${mapId}/features`, { feature }, once(key)),
  updateFeature: (mapId, featureId, body) => api<MapFeature>('PATCH', `/maps/${mapId}/features/${featureId}`, { feature: body }),
  async uploadPhoto(mapId, op, featureId, key) {
    const located = op.lng !== null && op.lat !== null
    await api('POST', `/maps/${mapId}/photos`, form('photo', {
      image: mediaFile(op.file), taken_at: op.takenAt, caption: op.caption, source: 'phone',
      lng: op.lng, lat: op.lat, location_source: located ? 'device' : null, map_feature_id: featureId,
      bioindicator_status: op.bioindicatorStatus ?? null,
    }), { ...once(key), ...(isVideo(op.file) ? { timeoutMs: VIDEO_TIMEOUT_MS } : {}) })
  },
  async createObservation(mapId, featureId, op, key) {
    await api('POST', `/maps/${mapId}/features/${featureId}/plant_observations`, form('plant_observation', {
      observed_on: op.observedOn, survival: op.survival, vigor: op.vigor, note: op.note,
      photo: op.photo ? photoFile(op.photo) : null,
    }), once(key))
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
      abundance: o.abundance, notes: o.notes, lng: o.lng, lat: o.lat, location_source: located ? 'device' : null,
      photo_taken_at: o.takenAt, photo_source: 'phone', photo: photoFile(photo),
    }), once(key))
  },
  async createComment(mapId, featureId, body, key) {
    await api('POST', `/maps/${mapId}/comments`, {
      comment: { body, ...(featureId ? { commentable_type: 'MapFeature', commentable_id: featureId } : {}) },
    }, once(key))
  },
}
