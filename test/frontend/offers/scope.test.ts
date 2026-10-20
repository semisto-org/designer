import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addableCandidates, itemMeasure } from '../../../app/frontend/components/offers/scope.ts'
import type { Candidate, ScopeInput, ScopeMeasure } from '../../../app/frontend/types/offers.ts'

const item = (over: Partial<ScopeInput>): ScopeInput => ({
  id: 'a', feature_id: null, label: null, planting_type: 'forest_garden', measure: null, plants_override: null, option: false, ...over,
})
const candidate = (over: Partial<Candidate>): Candidate => ({ id: 1, name: null, kind: 'pond', layer: 'water', measure_kind: 'area', measure: 356, ...over })
const resolved = (over: Partial<ScopeMeasure>): ScopeMeasure => ({
  id: 'a', feature_id: 1, missing: false, label: null, kind: 'pond', planting_type: 'forest_garden', measure_kind: 'area', measure: 356,
  plants: {}, plants_total: 0, option: false, ...over,
})

test('a map element just added, before the server answers, is measured from its candidate (no crash)', () => {
  assert.deepEqual(itemMeasure(item({ feature_id: 1 }), undefined, [candidate({})]), { fromMap: true, kind: 'area', value: 356 })
})

test('a map element the page knows nothing about yet is typed by hand rather than read from nowhere', () => {
  assert.deepEqual(itemMeasure(item({ feature_id: 9 }), undefined, []), { fromMap: false, kind: null, value: null })
  assert.equal(itemMeasure(item({ feature_id: 9 }), undefined, undefined).fromMap, false)
})

test('a resolved element keeps its map measure; a deleted one and a manual one are typed', () => {
  assert.deepEqual(itemMeasure(item({ feature_id: 1 }), resolved({}), [candidate({ measure: 400 })]), { fromMap: true, kind: 'area', value: 400 })
  assert.deepEqual(itemMeasure(item({ feature_id: 1 }), resolved({ measure: 90, measure_kind: 'length' }), []), { fromMap: true, kind: 'length', value: 90 })
  assert.equal(itemMeasure(item({ feature_id: 1 }), resolved({ missing: true }), []).fromMap, false)
  assert.equal(itemMeasure(item({}), resolved({ feature_id: null }), []).fromMap, false)
})

test('the menu leaves out what is already in the scope and what already stands (the house), grouped by layer', () => {
  const house = candidate({ id: 1, kind: 'building', layer: 'existing', measure: 792 })
  const pond = candidate({ id: 2 })
  const path = candidate({ id: 3, kind: 'path', layer: 'access', measure_kind: 'length', measure: 90.4 })
  const patch = candidate({ id: 4, kind: 'patch', layer: 'plants' })
  const pond2 = candidate({ id: 5 })
  const groups = addableCandidates([house, pond, path, patch, pond2], [item({ feature_id: 4 })])
  assert.deepEqual(groups.map(([layer, features]) => [layer, features.map((f) => f.id)]), [['water', [2, 5]], ['access', [3]]])
  assert.deepEqual(addableCandidates(undefined, []), [])
})
