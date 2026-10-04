// The outbox bound to the phone: saved in outbox.json, sent through api().
import * as Crypto from 'expo-crypto'
import { api, form } from './api'
import { emptyOutbox, flush, nextTempId, type NewFeature, type Op, type OutboxState, type Transport } from './outbox-core'
import { deletePhoto, readJson, writeJson } from './storage'
import type { MapFeature } from './types'

const FILE = 'outbox.json'
let state: OutboxState = readJson<OutboxState>(FILE) ?? emptyOutbox()
let flushing: Promise<number> | null = null
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
    if (op?.type === 'uploadPhoto') deletePhoto(op.file)
    if (op?.type === 'createObservation' && op.photo) deletePhoto(op.photo)
    commit({ ...state, ops: state.ops.filter((o) => o.id !== id) })
  },

  pending: (mapId?: number) => state.ops.filter((op) => !op.error && (mapId === undefined || op.mapId === mapId)).length,
  failed: (mapId?: number) => state.ops.filter((op) => op.error && (mapId === undefined || op.mapId === mapId)),

  /** Sends what is waiting; resolves with the number of changes sent. */
  flush(): Promise<number> {
    flushing ??= (async () => {
      try {
        let sent = 0
        // Ops added while sending go in the next round.
        for (let round = 0; round < 5 && outbox.pending() > 0; round++) {
          const snapshot = state
          const result = await flush(snapshot, transport)
          // Ops queued while sending stay after the ones of this run.
          const inRun = new Set(snapshot.ops.map((o) => o.id))
          commit({
            ids: { ...state.ids, ...result.state.ids },
            ops: [...result.state.ops, ...state.ops.filter((o) => !inRun.has(o.id))],
          })
          result.sentFiles.forEach(deletePhoto)
          sent += result.sent
          if (result.stopped !== 'done') break
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

const transport: Transport = {
  createFeature: (mapId, feature) => api<MapFeature>('POST', `/maps/${mapId}/features`, { feature }),
  updateFeature: (mapId, featureId, body) => api<MapFeature>('PATCH', `/maps/${mapId}/features/${featureId}`, { feature: body }),
  async uploadPhoto(mapId, op, featureId) {
    const located = op.lng !== null && op.lat !== null
    await api('POST', `/maps/${mapId}/photos`, form('photo', {
      image: photoFile(op.file), taken_at: op.takenAt, caption: op.caption, source: 'phone',
      lng: op.lng, lat: op.lat, location_source: located ? 'device' : null, map_feature_id: featureId,
    }))
  },
  async createObservation(mapId, featureId, op) {
    await api('POST', `/maps/${mapId}/features/${featureId}/plant_observations`, form('plant_observation', {
      observed_on: op.observedOn, survival: op.survival, vigor: op.vigor, note: op.note,
      photo: op.photo ? photoFile(op.photo) : null,
    }))
  },
  async createComment(mapId, featureId, body) {
    await api('POST', `/maps/${mapId}/comments`, {
      comment: { body, ...(featureId ? { commentable_type: 'MapFeature', commentable_id: featureId } : {}) },
    })
  },
}
