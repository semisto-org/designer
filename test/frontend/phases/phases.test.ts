import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inkOpacity, paperOpacity } from '../../../app/frontend/map/phases/fade.ts'
import { compareWith, phaseCollection, phaseStateOf, type OpenPhase } from '../../../app/frontend/map/phases/types.ts'

const point = (id: number, props: Record<string, unknown> = {}) => ({
  type: 'Feature' as const,
  id,
  geometry: { type: 'Point' as const, coordinates: [4.9, 50.3] },
  properties: { id, layer: 'water', kind: 'pond', ...props },
})

test('an element of a phase is removed, changed or the same as today', () => {
  const compare = { added: [9], removed: [1], changed: [2] }
  assert.equal(phaseStateOf(compare, 1), 'removed')
  assert.equal(phaseStateOf(compare, 2), 'changed')
  assert.equal(phaseStateOf(compare, 3), 'same')
})

test('the phase sheet carries the project and what of the existing changed, each with its state', () => {
  const phase = {
    id: 1, number: 1, name: 'Esquisse', notes: null, counts: {}, putAwayAt: '2026-11-01T10:00:00Z',
    snapshot: { type: 'FeatureCollection', features: [point(1, { planned: true }), point(2), point(3, { layer: 'plants', kind: 'tree' }), point(4, { layer: 'plants', kind: 'tree', planted_on: '2025-11-20' })] },
    compare: { added: [], removed: [1], changed: [4] },
  } as unknown as OpenPhase
  const props = phaseCollection(phase).features.map((f) => f.properties)
  assert.deepEqual(props.map((p) => p?.id), [1, 3, 4])
  assert.deepEqual(props.map((p) => p?.state), ['removed', 'same', 'changed'])
  assert.deepEqual(props.map((p) => p?.planned), [true, true, false])
})

test('the fade goes from the phase over today to the phase alone on paper', () => {
  assert.equal(paperOpacity(0), 0)
  assert.equal(paperOpacity(0.2), 0)
  assert.equal(paperOpacity(1), 0.92)
  assert.ok(inkOpacity(0) > 0.4 && inkOpacity(0) < inkOpacity(1))
  assert.equal(inkOpacity(1), 1)
})

test('today is compared with the phase from the editor elements: notes and other variants left out', () => {
  const phase = {
    snapshot: { type: 'FeatureCollection', features: [point(1, { lockVersion: 0 }), point(2, { lockVersion: 0 }), point(3, { lockVersion: 2 })] },
    compare: { added: [], removed: [], changed: [] },
  } as unknown as OpenPhase
  const today = [
    { properties: { id: 1, layer: 'water', status: 'active', lockVersion: 0 } },
    { properties: { id: 3, layer: 'water', status: 'active', lockVersion: 3 } },
    { properties: { id: 4, layer: 'access', status: 'active', lockVersion: 0 } },
    { properties: { id: 5, layer: 'notes', status: 'active', lockVersion: 0 } },
    { properties: { id: 6, layer: 'water', status: 'draft', lockVersion: 0 } },
    { properties: { id: 7, layer: 'water', status: 'active', lockVersion: 0, variant_id: 9 } },
    { properties: { id: 8, layer: 'water', status: 'active', lockVersion: 0, variant_id: 10 } },
  ]
  assert.deepEqual(compareWith(phase, today, 10), { added: [4, 8], removed: [2], changed: [3] })
})
