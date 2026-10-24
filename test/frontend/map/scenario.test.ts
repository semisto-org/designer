import { test } from 'node:test'
import assert from 'node:assert/strict'
import { featureFilter } from '@maplibre/maplibre-gl-style-spec'
import { canBePlanned, canBeRemoved, isToRemove, TO_REMOVE_EXPR, isPlanned, isPlannedElement, isPlannedPlant, PLANNED_EXPR, PLANNED_PLANT_EXPR } from '../../../app/frontend/map/scenario.ts'

const planned = { layer: 'plants', kind: 'plant', status: 'active', species_id: 3 }
const planted = { ...planned, planted_on: '2025-11-20' }
const patch = { layer: 'plants', kind: 'patch', status: 'active' }
const pond = { layer: 'water', kind: 'pond', status: 'active' }
const plannedPond = { ...pond, planned: true }

test('a plant is planned until it is marked as planted', () => {
  assert.equal(isPlannedPlant(planned), true)
  assert.equal(isPlannedPlant({ ...planned, planted_on: null }), true)
  assert.equal(isPlannedPlant(planted), false)
  assert.equal(isPlannedPlant(patch), false)
  assert.equal(isPlannedPlant(pond), false)
  assert.equal(isPlannedPlant(null), false)
})

test('an element is planned while it carries planned: true', () => {
  assert.equal(isPlannedElement(plannedPond), true)
  assert.equal(isPlannedElement(pond), false)
  assert.equal(isPlanned(plannedPond), true)
  assert.equal(isPlanned(planted), false)
})

test('the MapLibre expressions agree with the JavaScript tests', () => {
  const evaluate = (filter: unknown, properties: Record<string, unknown>) =>
    featureFilter(filter as never, 'layers[0].filter').filter({ zoom: 18 }, { type: 1, properties, geometry: [] } as never)
  for (const f of [planned, planted, patch, pond, plannedPond, { ...planned, planted_on: null }]) {
    assert.equal(evaluate(PLANNED_PLANT_EXPR, f), isPlannedPlant(f), JSON.stringify(f))
    assert.equal(evaluate(PLANNED_EXPR, f), isPlanned(f), JSON.stringify(f))
  }
})

test('what can be « En projet »: works on the land, a building or a wall of the existing layer, never a note or a plant', () => {
  assert.equal(canBePlanned('water', 'pond'), true)
  assert.equal(canBePlanned('structures', 'greenhouse'), true)
  assert.equal(canBePlanned('plants', 'patch'), true)
  assert.equal(canBePlanned('existing', 'building'), true)
  assert.equal(canBePlanned('existing', 'wall'), true)
  assert.equal(canBePlanned('existing', 'existing_tree'), false)
  assert.equal(canBePlanned('notes', 'note_point'), false)
  assert.equal(canBePlanned('plants', 'plant'), false)
})

test('what the project takes away: an element on the ground with to_remove, until it is taken away', () => {
  const fence = { layer: 'structures', kind: 'fence', status: 'active', to_remove: true }
  const cases = [
    [fence, true],
    [{ ...fence, removed_on: '2026-03-01' }, false],
    [{ ...fence, planned: true }, false],
    [{ layer: 'notes', kind: 'note_point', to_remove: true }, false],
    [{ ...planted, to_remove: true }, false],
    [{ layer: 'existing', kind: 'existing_tree', to_remove: true }, true],
  ] as const
  const evaluate = (properties: Record<string, unknown>) =>
    featureFilter(TO_REMOVE_EXPR as never, 'layers[0].filter').filter({ zoom: 18 }, { type: 1, properties, geometry: [] } as never)
  for (const [properties, expected] of cases) {
    assert.equal(isToRemove(properties), expected, JSON.stringify(properties))
    assert.equal(evaluate(properties as Record<string, unknown>), expected, JSON.stringify(properties))
  }
  assert.equal(canBeRemoved('existing', 'building'), true)
  assert.equal(canBeRemoved('notes', 'sector'), false)
})
