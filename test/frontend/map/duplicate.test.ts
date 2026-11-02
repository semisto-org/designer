import { test } from 'node:test'
import assert from 'node:assert/strict'
import { besideGeometry, duplicateInput, placesByClick } from '../../../app/frontend/map/editor/duplicate.ts'
import type { MapFeature } from '../../../app/frontend/types/index.ts'

const oak = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [4.9, 50.34] },
  properties: {
    id: 12, layer: 'existing', kind: 'existing_tree', name: 'Chêne', notes: 'Le long du chemin', status: 'active', source: 'human',
    rationale: null, style: { color: '#58684c' }, tags: ['haie nord'], lockVersion: 3, updatedAt: '2026-10-13T10:00:00Z',
    species: 'Quercus robur', crown_diameter_m: 12, health: 'good', number: 7,
  },
} as unknown as MapFeature

test('a copy keeps what was typed for the original, not its identity', () => {
  const at = { type: 'Point' as const, coordinates: [4.901, 50.341] }
  const copy = duplicateInput(oak, at)
  assert.deepEqual(copy.geometry, at)
  assert.equal(copy.kind, 'existing_tree')
  assert.equal(copy.name, 'Chêne')
  assert.equal(copy.notes, 'Le long du chemin')
  assert.deepEqual(copy.tags, ['haie nord'])
  assert.deepEqual(copy.properties, { species: 'Quercus robur', crown_diameter_m: 12, health: 'good' })
  assert.equal(copy.status, 'active')
})

test('points are placed by click, lines and surfaces beside the original', () => {
  assert.equal(placesByClick(oak), true)
  const hedge = { ...oak, geometry: { type: 'LineString', coordinates: [[4.9, 50.34], [4.901, 50.34]] } } as MapFeature
  assert.equal(placesByClick(hedge), false)
  const moved = besideGeometry(hedge.geometry) as { coordinates: number[][] }
  assert.ok(moved.coordinates[0][0] > 4.9 && moved.coordinates[0][1] < 50.34)
  // About four metres away: 0.000036° of latitude per metre or so.
  assert.ok(Math.abs(50.34 - moved.coordinates[0][1]) < 0.0001)
})
