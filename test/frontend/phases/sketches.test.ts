import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareWith, keptByPhase, phaseCollection, phaseFeaturesOf, phaseRetained, type OpenPhase } from '../../../app/frontend/map/phases/types.ts'
import { comparedCollection } from '../../../app/frontend/map/variants/variants.ts'
import type { MapFeature } from '../../../app/frontend/types/index.ts'

const line = (id: number, props: Record<string, unknown> = {}) => ({
  type: 'Feature' as const,
  id,
  geometry: { type: 'LineString' as const, coordinates: [[4.9, 50.3], [4.91, 50.31]] },
  properties: { id, layer: 'access', kind: 'path', planned: true, ...props },
})

// Julie (variant 10, retained then) placed a path; Michael (variant 11) only drew with a pencil.
const phase = {
  id: 1, number: 1, name: 'Esquisses', notes: null, counts: {}, putAwayAt: '2026-11-22T08:00:00Z', keepsSketches: true,
  variants: [{ id: 10, name: 'Esquisse de Julie', retained: true, author: 'Julie' }, { id: 11, name: 'Esquisse de Michael', retained: false, author: 'Michael' }],
  snapshot: {
    type: 'FeatureCollection',
    features: [line(1), line(2, { variant_id: 10 }), line(3, { layer: 'notes', kind: 'sketch', planned: undefined, variant_id: 11, lockVersion: 0 })],
  },
  compare: { added: [], removed: [], changed: [] },
} as unknown as OpenPhase

test('a phase opens on the sketch retained then, and shows each one with the common project', () => {
  assert.equal(phaseRetained(phase), 10)
  assert.deepEqual(phaseFeaturesOf(phase, 10).map((f) => f.properties.id), [1, 2])
  assert.deepEqual(phaseFeaturesOf(phase, 11).map((f) => f.properties.id), [1, 3])
})

test('a pencil sketch is design work: kept by a phase, laid on its sheet as a stroke', () => {
  assert.ok(keptByPhase({ layer: 'notes', kind: 'sketch' }))
  assert.ok(!keptByPhase({ layer: 'notes', kind: 'note' }))
  const props = phaseCollection(phase, phase.compare, 11).features.map((f) => f.properties)
  assert.deepEqual(props.map((p) => p?.id), [1, 3])
  assert.equal(props[1]?.stroke, true)
  assert.equal(props[1]?.planned, true)
})

test('a sketch of a phase is compared with that sketch today, while it still exists', () => {
  const today = [
    { properties: { id: 1, layer: 'access', kind: 'path', status: 'active' } },
    { properties: { id: 2, layer: 'access', kind: 'path', status: 'active', variant_id: 10 } },
  ]
  // Michael's stroke was erased since: removed from his sketch, not from Julie's.
  assert.deepEqual(compareWith(phase, today, 10, 11, [10, 11]).removed, [3])
  assert.deepEqual(compareWith(phase, today, 10, 10, [10, 11]).removed, [])
})

test('a phase put away before strokes were kept does not see today\'s strokes as added', () => {
  const today = [
    { properties: { id: 1, layer: 'access', kind: 'path', status: 'active' } },
    { properties: { id: 9, layer: 'notes', kind: 'sketch', status: 'active' } },
  ]
  const older = { ...phase, variants: undefined, keepsSketches: undefined, snapshot: { type: 'FeatureCollection', features: [line(1)] } } as unknown as OpenPhase
  assert.deepEqual(compareWith(older, today, null, null).added, [])
  assert.deepEqual(compareWith({ ...older, keepsSketches: true }, today, null, null).added, [9])
})

test('a teammate laid on the table brings only their own elements', () => {
  const features = [
    { properties: { id: 1, layer: 'access', kind: 'path', status: 'active' } },
    { properties: { id: 3, layer: 'notes', kind: 'sketch', status: 'active', variant_id: 11 } },
    { properties: { id: 4, layer: 'water', kind: 'pond', status: 'rejected', variant_id: 11 } },
  ].map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [4.9, 50.3] }, ...f })) as unknown as MapFeature[]
  const props = comparedCollection(features, 11).features.map((f) => f.properties)
  assert.deepEqual(props.map((p) => p?.id), [3])
  assert.equal(props[0]?.stroke, true)
})
