import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adjustable, adjustedChanges, fieldKey, inputValue, isDeletion, isKnownField, shownValue, updatesOfBatch } from '../../../app/frontend/map/feature_updates/diff.ts'
import type { FeatureUpdateData } from '../../../app/frontend/map/feature_updates/diff.ts'

test('a property field is named by its key', () => {
  assert.equal(fieldKey('properties.planted_on'), 'planted_on')
  assert.equal(fieldKey('name'), 'name')
  assert.ok(isKnownField('planted_on'))
  assert.ok(!isKnownField('height_m'))
})

test('values read the French way: dates, lists, catalogue names, positions, nothing', () => {
  assert.deepEqual(shownValue({ field: 'properties.planted_on', after: '2026-05-23' }, 'after'), { kind: 'text', text: '23 mai 2026' })
  assert.deepEqual(shownValue({ field: 'properties.planted_on', before: null, after: '2026-05-23' }, 'before'), { kind: 'empty' })
  assert.deepEqual(shownValue({ field: 'tags', after: ['Strate basse', 'Phase 1'] }, 'after'), { kind: 'text', text: 'Strate basse, Phase 1' })
  assert.deepEqual(shownValue({ field: 'tags', before: [] }, 'before'), { kind: 'empty' })
  assert.deepEqual(shownValue({ field: 'properties.species_id', after: 4, afterLabel: 'Pommier · Malus domestica' }, 'after'), { kind: 'text', text: 'Pommier · Malus domestica' })
  assert.deepEqual(shownValue({ field: 'geometry', after: { type: 'Point', coordinates: [4.9, 50.3] } }, 'after'), { kind: 'geometry' })
})

test('the person retypes values, sent back in the shape the server expects', () => {
  const changes = [
    { field: 'name', before: 'Consoude', after: 'Consoude de Russie' },
    { field: 'tags', before: [], after: ['Strate basse'] },
    { field: 'properties.planted_on', before: null, after: '2026-05-23' },
    { field: 'properties.count', before: 1, after: 3 },
    { field: 'geometry', before: {}, after: {} },
  ]
  assert.ok(!adjustable(changes[4]))
  assert.equal(inputValue(changes[1]), 'Strate basse')
  assert.deepEqual(adjustedChanges(changes, {
    name: ' ', tags: 'Strate basse, Paillée ,', 'properties.planted_on': '2026-05-24', 'properties.count': '5', geometry: 'x',
  }), { name: null, tags: ['Strate basse', 'Paillée'], properties: { planted_on: '2026-05-24', count: 5 } })
  assert.deepEqual(adjustedChanges(changes, { 'properties.planted_on': '' }), { properties: { planted_on: null } })
})

test('the updates of one proposal', () => {
  const update = (id: number, batch: string) => ({ id, batch }) as FeatureUpdateData
  assert.deepEqual(updatesOfBatch([update(1, 'a'), update(2, 'b'), update(3, 'a')], 'a').map((u) => u.id), [1, 3])
})

test('a proposed deletion is recognised and has nothing to adjust', () => {
  assert.ok(isDeletion({ proposedChanges: { delete: true } }))
  assert.ok(!isDeletion({ proposedChanges: { name: 'Pommier' } }))
  assert.ok(!adjustable({ field: 'delete', before: null, after: true }))
})
