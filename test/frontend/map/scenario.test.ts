import { test } from 'node:test'
import assert from 'node:assert/strict'
import { featureFilter } from '@maplibre/maplibre-gl-style-spec'
import { isPlanned, isPlannedElement, isPlannedPlant, PLANNED_EXPR, PLANNED_PLANT_EXPR } from '../../../app/frontend/map/scenario.ts'

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
