import { applyPending, emptyOutbox, flush, nextTempId, ownProperties, type Op, type OutboxState, type Transport } from '../outbox-core'
import type { MapBundle, MapFeature } from '../types'

const at = '2026-10-04T10:00:00Z'
const plant = (id: number, extra: Record<string, unknown> = {}): MapFeature => ({
  type: 'Feature', id, geometry: { type: 'Point', coordinates: [4.95, 50.32] },
  properties: { id, layer: 'plants', kind: 'plant', name: null, notes: null, status: 'active', lockVersion: 2, species_id: 7, ...extra },
})
const bundle = (features: MapFeature[]): MapBundle => ({
  map: { id: 1 } as MapBundle['map'], mapEntitlements: {}, layers: [], features, photos: [],
  planting: { species: {}, varieties: {}, palette: [] }, syncedAt: at,
})
const state = (ops: Op[], ids: Record<string, number> = {}): OutboxState => ({ ops, ids })
const create = (id: string, tempId: number): Op => ({
  id, mapId: 1, createdAt: at, type: 'createFeature', tempId,
  feature: { layer: 'plants', kind: 'plant', properties: { species_id: 3 }, geometry: { type: 'Point', coordinates: [4.9, 50.3] } },
})

function transport(overrides: Partial<Transport> = {}) {
  const calls: string[] = []
  let next = 100
  const t: Transport = {
    createFeature: async () => { calls.push('create'); return plant(next++) },
    updateFeature: async (_m, id, body) => { calls.push(`update ${id} v${body.lock_version}`); return plant(id) },
    uploadPhoto: async (_m, _op, featureId) => { calls.push(`photo ${featureId}`) },
    createObservation: async (_m, featureId) => { calls.push(`observation ${featureId}`) },
    createComment: async (_m, featureId) => { calls.push(`comment ${featureId}`) },
    createBioindicator: async (_m, op) => { calls.push(`bioindicator ${op.observation.speciesName}`) },
    ...overrides,
  }
  return { t, calls }
}

describe('ownProperties', () => {
  it('drops the keys the server merges in', () => {
    expect(ownProperties(plant(1).properties)).toEqual({ species_id: 7 })
  })
})

describe('nextTempId', () => {
  it('counts down below every temp id in use', () => {
    expect(nextTempId(emptyOutbox())).toBe(-1)
    expect(nextTempId(state([create('a', -1), create('b', -2)]))).toBe(-3)
    expect(nextTempId(state([], { '-4': 12 }))).toBe(-5)
  })
})

describe('applyPending', () => {
  it('shows new features and changes before they are sent', () => {
    const ops: Op[] = [
      create('a', -1),
      { id: 'b', mapId: 1, createdAt: at, type: 'updateFeature', featureId: 5, lockVersion: 2, changes: { properties: { species_id: 7, planted_on: '2026-10-04' } } },
    ]
    const shown = applyPending(bundle([plant(5)]), state(ops))
    expect(shown.features.map((f) => f.id)).toEqual([5, -1])
    expect(shown.features[0].properties).toMatchObject({ planted_on: '2026-10-04', kind: 'plant', lockVersion: 2, pending: true })
    expect(shown.features[1].properties).toMatchObject({ species_id: 3, pending: true })
  })

  it('ignores refused ops, other maps and creations already on the server', () => {
    const ops: Op[] = [{ ...create('a', -1), error: 'nope' }, { ...create('b', -2), mapId: 2 }, create('c', -3)]
    const shown = applyPending(bundle([plant(9)]), state(ops, { '-3': 9 }))
    expect(shown.features.map((f) => f.id)).toEqual([9])
  })
})

describe('flush', () => {
  it('sends in order and points follow-ups at the id the server gave', async () => {
    const { t, calls } = transport()
    const ops: Op[] = [
      create('a', -1),
      { id: 'b', mapId: 1, createdAt: at, type: 'createObservation', featureId: -1, observedOn: '2026-10-04', survival: 'established', vigor: 4, note: null, photo: 'file:///obs.jpg' },
      { id: 'c', mapId: 1, createdAt: at, type: 'uploadPhoto', featureId: -1, file: 'file:///p.jpg', lng: 4.9, lat: 50.3, takenAt: at },
      { id: 'd', mapId: 1, createdAt: at, type: 'createComment', featureId: null, body: 'Belle reprise' },
    ]
    const result = await flush(state(ops), t)
    expect(calls).toEqual(['create', 'observation 100', 'photo 100', 'comment null'])
    expect(result).toMatchObject({ sent: 4, stopped: 'done', state: { ops: [], ids: { '-1': 100 } } })
    expect(result.sentFiles).toEqual(['file:///obs.jpg', 'file:///p.jpg'])
  })

  it('sends a bio-indicator plant with its photo, then lets the photo go', async () => {
    const { t, calls } = transport()
    const observation = {
      speciesName: 'Ortie dioïque', latinName: 'Urtica dioica', catalogKey: 'ortie', plantSpeciesId: null,
      abundance: 'frequent' as const, notes: null, lng: 4.9, lat: 50.3, takenAt: at,
    }
    const result = await flush(state([{ id: 'a', mapId: 1, createdAt: at, type: 'createBioindicator', observation, photo: 'file:///ortie.jpg' }]), t)
    expect(calls).toEqual(['bioindicator Ortie dioïque'])
    expect(result.sentFiles).toEqual(['file:///ortie.jpg'])
  })

  it('stops offline and keeps the rest in order', async () => {
    const { t } = transport({ uploadPhoto: async () => { throw { status: 0 } } })
    const ops: Op[] = [
      { id: 'a', mapId: 1, createdAt: at, type: 'createComment', featureId: 5, body: 'x' },
      { id: 'b', mapId: 1, createdAt: at, type: 'uploadPhoto', featureId: null, file: 'f', lng: null, lat: null, takenAt: at },
      { id: 'c', mapId: 1, createdAt: at, type: 'createComment', featureId: 5, body: 'y' },
    ]
    const result = await flush(state(ops), t)
    expect(result.stopped).toBe('offline')
    expect(result.state.ops.map((o) => o.id)).toEqual(['b', 'c'])
  })

  it('stops on a server error, to retry later', async () => {
    const { t } = transport({ createComment: async () => { throw { status: 503 } } })
    const result = await flush(state([{ id: 'a', mapId: 1, createdAt: at, type: 'createComment', featureId: 5, body: 'x' }]), t)
    expect(result.stopped).toBe('server')
    expect(result.state.ops[0].error).toBeUndefined()
  })

  it('keeps a refused op with its reason, marks what depends on it and goes on', async () => {
    const { t, calls } = transport({ createFeature: async () => { throw { status: 422, body: { message: 'Géométrie invalide' } } } })
    const ops: Op[] = [
      create('a', -1),
      { id: 'b', mapId: 1, createdAt: at, type: 'createComment', featureId: -1, body: 'x' },
      { id: 'c', mapId: 1, createdAt: at, type: 'createComment', featureId: 5, body: 'y' },
    ]
    const result = await flush(state(ops), t)
    expect(calls).toEqual(['comment 5'])
    expect(result.state.ops.map((o) => [o.id, o.error])).toEqual([['a', 'Géométrie invalide'], ['b', 'parent_failed']])
  })

  it('on a conflict, applies the change on top of the newer version', async () => {
    const bodies: Record<string, unknown>[] = []
    const { t } = transport({
      updateFeature: async (_m, id, body) => {
        bodies.push(body)
        if (bodies.length === 1) throw { status: 409, body: { feature: plant(id, { lockVersion: 5, variety_id: 2 }) } }
        return plant(id)
      },
    })
    const op: Op = { id: 'a', mapId: 1, createdAt: at, type: 'updateFeature', featureId: 5, lockVersion: 2, changes: { properties: { species_id: 7, planted_on: '2026-10-04' } } }
    const result = await flush(state([op]), t)
    expect(result.sent).toBe(1)
    expect(bodies[1]).toEqual({ properties: { species_id: 7, variety_id: 2, planted_on: '2026-10-04' }, lock_version: 5 })
  })
})
