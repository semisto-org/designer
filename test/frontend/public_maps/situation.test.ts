import { test } from 'node:test'
import assert from 'node:assert/strict'
import { featuresIn, growthIn, hasProject } from '../../../app/frontend/public_maps/situation.ts'

const feature = (id: number, properties: Record<string, unknown>) => ({ type: 'Feature' as const, id, geometry: { type: 'Point' as const, coordinates: [4.9, 50.3] }, properties: { id, ...properties } })
const barn = feature(1, { layer: 'existing', kind: 'building' })
const house = feature(2, { layer: 'existing', kind: 'building', planned: true })
const fence = feature(3, { layer: 'access', kind: 'fence', to_remove: true })
const apple = feature(4, { layer: 'plants', kind: 'plant', planted_on: '2024-11-20' })
const pear = feature(5, { layer: 'plants', kind: 'plant' })
const collection = (...features: ReturnType<typeof feature>[]) => ({ type: 'FeatureCollection' as const, features })
const ids = (c: { features: { properties: { id: number } }[] }) => c.features.map((f) => f.properties.id)

test('a snapshot published without the project has nothing to switch', () => {
  assert.equal(hasProject(collection(barn, apple)), false)
  assert.equal(hasProject(collection(barn, house)), true)
  assert.equal(hasProject(collection(barn, fence)), true)
})

test('today leaves out the project, the project leaves out what it takes away', () => {
  const all = collection(barn, house, fence, apple, pear)
  assert.deepEqual(ids(featuresIn(all, 'today')), [1, 3, 4])
  assert.deepEqual(ids(featuresIn(all, 'project')), [1, 2, 4, 5])
})

test('the growing garden follows the features kept', () => {
  const growth = { today: '2026-10-24', origin: '2024-01-01', plants: [{ id: 4 }, { id: 5 }], patches: [{ id: 9 }] } as never
  const kept = growthIn(growth, featuresIn(collection(barn, apple, pear), 'today'))
  assert.deepEqual(kept.plants.map((p: { id: number }) => p.id), [4])
  assert.deepEqual(kept.patches, [])
})
