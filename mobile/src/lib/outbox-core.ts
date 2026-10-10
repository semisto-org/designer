// The outbox: every change made on the terrain is saved here first, shown
// on the map at once, and sent to the server in order when the network is
// there. Pure logic (no phone APIs), so it is unit-tested.
import type { FeatureProperties, Geometry, MapBundle, MapFeature, Survival } from './types'

/** A feature drawn on the phone gets a negative id until the server gives it one. */
export type FeatureRef = number

type Base = { id: string; mapId: number; createdAt: string; error?: string }

export type NewFeature = {
  layer: string
  kind: string
  name?: string | null
  notes?: string | null
  properties: Record<string, unknown>
  geometry: Geometry
}

export type Op = Base & (
  | { type: 'createFeature'; tempId: number; feature: NewFeature }
  | { type: 'updateFeature'; featureId: FeatureRef; lockVersion: number; changes: { name?: string | null; notes?: string | null; properties?: Record<string, unknown>; geometry?: Geometry } }
  | { type: 'uploadPhoto'; file: string; lng: number | null; lat: number | null; takenAt: string; featureId: FeatureRef | null; caption?: string | null; bioindicatorStatus?: 'to_analyze' }
  | { type: 'createObservation'; featureId: FeatureRef; observedOn: string; survival: Survival; vigor: number | null; note: string | null; photo: string | null }
  | { type: 'createComment'; featureId: FeatureRef | null; body: string }
  | { type: 'createBioindicator'; observation: NewBioindicator; photo: string }
)

/** A wild plant noted from its photo (identified by Pl@ntNet, confirmed by the person). */
export type NewBioindicator = {
  speciesName: string
  latinName: string | null
  catalogKey: string | null
  plantSpeciesId: number | null
  abundance: 'rare' | 'present' | 'frequent' | 'dominant'
  notes: string | null
  lng: number | null
  lat: number | null
  takenAt: string
}

export type OutboxState = {
  ops: Op[]
  /** Temporary id → server id, for ops that point to a feature made offline. */
  ids: Record<string, number>
}

export const emptyOutbox = (): OutboxState => ({ ops: [], ids: {} })

// Keys the server merges into properties (MapFeature#as_geojson): they are
// not part of the feature's own `properties` hash and never sent back.
const RESERVED = new Set(['id', 'layer', 'kind', 'name', 'notes', 'status', 'source', 'rationale', 'style', 'lockVersion', 'updatedAt'])

export function ownProperties(properties: FeatureProperties | Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).filter(([key]) => !RESERVED.has(key)))
}

export function resolveId(state: OutboxState, ref: FeatureRef | null): number | null {
  if (ref === null) return null
  return ref < 0 ? (state.ids[String(ref)] ?? ref) : ref
}

export function nextTempId(state: OutboxState): number {
  const used = state.ops.flatMap((op) => (op.type === 'createFeature' ? [op.tempId] : []))
  return Math.min(-1, ...used.map((id) => id - 1), ...Object.keys(state.ids).map((id) => Number(id) - 1))
}

/** The map as the person sees it: the server's copy plus what is waiting to be sent. */
export function applyPending(bundle: MapBundle, state: OutboxState): MapBundle {
  const ops = state.ops.filter((op) => op.mapId === bundle.map.id && !op.error)
  if (ops.length === 0) return bundle
  let features = bundle.features.slice()
  for (const op of ops) {
    if (op.type === 'createFeature') {
      if (features.some((f) => f.id === resolveId(state, op.tempId))) continue
      features.push({
        type: 'Feature', id: op.tempId, geometry: op.feature.geometry,
        properties: {
          ...op.feature.properties, id: op.tempId, layer: op.feature.layer, kind: op.feature.kind,
          name: op.feature.name ?? null, notes: op.feature.notes ?? null, status: 'active', lockVersion: 0, pending: true,
        },
      })
    } else if (op.type === 'updateFeature') {
      const id = resolveId(state, op.featureId)
      features = features.map((f) => (f.id === id || f.id === op.featureId ? applyChanges(f, op.changes) : f))
    }
  }
  return { ...bundle, features }
}

function applyChanges(feature: MapFeature, changes: Extract<Op, { type: 'updateFeature' }>['changes']): MapFeature {
  const reserved = Object.fromEntries(Object.entries(feature.properties).filter(([key]) => RESERVED.has(key)))
  return {
    ...feature,
    geometry: changes.geometry ?? feature.geometry,
    properties: {
      ...(changes.properties ? { ...reserved, ...changes.properties } : feature.properties),
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
      pending: true,
    } as FeatureProperties,
  }
}

/** What the outbox needs from the server; ApiError-like errors carry a status (0 = offline). */
export type Transport = {
  createFeature(mapId: number, feature: NewFeature): Promise<MapFeature>
  updateFeature(mapId: number, featureId: number, body: Record<string, unknown>): Promise<MapFeature>
  uploadPhoto(mapId: number, op: Extract<Op, { type: 'uploadPhoto' }>, featureId: number | null): Promise<void>
  createObservation(mapId: number, featureId: number, op: Extract<Op, { type: 'createObservation' }>): Promise<void>
  createComment(mapId: number, featureId: number | null, body: string): Promise<void>
  createBioindicator(mapId: number, op: Extract<Op, { type: 'createBioindicator' }>): Promise<void>
}

type HttpError = { status: number; body?: Record<string, unknown> | null; message?: string }
const statusOf = (error: unknown) => (typeof (error as HttpError)?.status === 'number' ? (error as HttpError).status : 0)

export type FlushResult = { state: OutboxState; sent: number; stopped: 'done' | 'offline' | 'server'; sentFiles: string[] }

/**
 * Sends the ops in order. Stops at the first network or server failure
 * (to retry later, order kept). An op the server refuses (4xx) is kept
 * with its error for the person to see, and the next ones go on.
 */
export async function flush(initial: OutboxState, transport: Transport): Promise<FlushResult> {
  let state: OutboxState = { ops: initial.ops.slice(), ids: { ...initial.ids } }
  let sent = 0
  const sentFiles: string[] = []
  for (const op of initial.ops) {
    if (op.error) continue
    const blocked = dependsOnUnsent(state, op)
    if (blocked) {
      state = replace(state, op, { ...op, error: 'parent_failed' })
      continue
    }
    try {
      await send(state, op, transport, (tempId, realId) => { state = { ...state, ids: { ...state.ids, [String(tempId)]: realId } } })
      state = { ...state, ops: state.ops.filter((o) => o.id !== op.id) }
      sent += 1
      if (op.type === 'uploadPhoto') sentFiles.push(op.file)
      if (op.type === 'createObservation' && op.photo) sentFiles.push(op.photo)
      if (op.type === 'createBioindicator') sentFiles.push(op.photo)
    } catch (error) {
      const status = statusOf(error)
      if (status === 0) return { state, sent, stopped: 'offline', sentFiles }
      if (status >= 500 || status === 429) return { state, sent, stopped: 'server', sentFiles }
      const message = (error as HttpError).body?.message ?? (error as HttpError).message ?? `HTTP ${status}`
      state = replace(state, op, { ...op, error: String(message) })
    }
  }
  return { state, sent, stopped: 'done', sentFiles }
}

function replace(state: OutboxState, op: Op, next: Op): OutboxState {
  return { ...state, ops: state.ops.map((o) => (o.id === op.id ? next : o)) }
}

// An op on a feature drawn offline whose creation the server refused.
function dependsOnUnsent(state: OutboxState, op: Op): boolean {
  const ref = 'featureId' in op ? op.featureId : null
  if (ref === null || ref >= 0 || state.ids[String(ref)]) return false
  return state.ops.some((o) => o.type === 'createFeature' && o.tempId === ref && o.error)
}

async function send(state: OutboxState, op: Op, transport: Transport, mapTempId: (tempId: number, realId: number) => void) {
  const id = (ref: number | null) => {
    const resolved = resolveId(state, ref)
    if (resolved !== null && resolved < 0) throw { status: 422, message: 'parent_failed' }
    return resolved
  }
  switch (op.type) {
    case 'createFeature': {
      const created = await transport.createFeature(op.mapId, op.feature)
      mapTempId(op.tempId, created.id)
      return
    }
    case 'updateFeature': {
      const featureId = id(op.featureId)!
      const body = { ...op.changes, lock_version: op.lockVersion }
      try {
        await transport.updateFeature(op.mapId, featureId, body)
      } catch (error) {
        // Someone changed it meanwhile: the terrain wins, on top of their version.
        const server = (error as HttpError).body?.feature as MapFeature | undefined
        if (statusOf(error) !== 409 || !server) throw error
        const properties = op.changes.properties ? { ...ownProperties(server.properties), ...op.changes.properties } : undefined
        await transport.updateFeature(op.mapId, featureId, { ...op.changes, properties, lock_version: server.properties.lockVersion })
      }
      return
    }
    case 'uploadPhoto':
      return transport.uploadPhoto(op.mapId, op, id(op.featureId))
    case 'createObservation':
      return transport.createObservation(op.mapId, id(op.featureId)!, op)
    case 'createComment':
      return transport.createComment(op.mapId, id(op.featureId), op.body)
    case 'createBioindicator':
      return transport.createBioindicator(op.mapId, op)
  }
}

/** Ops created offline for a feature carry its temp id; once sent, update calls use the real lock version. */
export function lockVersionFor(bundle: MapBundle, featureId: number): number {
  return bundle.features.find((f) => f.id === featureId)?.properties.lockVersion ?? 0
}
