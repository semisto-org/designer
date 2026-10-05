import { test } from 'node:test'
import assert from 'node:assert/strict'
import { featureFilter } from '@maplibre/maplibre-gl-style-spec'
import { inScenario, isPlannedPlant, parseScenario, scenarioFilter, PLANNED_PLANT_EXPR } from '../../../app/frontend/map/scenario.ts'

const planned = { layer: 'plants', kind: 'plant', status: 'active', species_id: 3 }
const planted = { ...planned, planted_on: '2025-11-20' }
const patch = { layer: 'plants', kind: 'patch', status: 'active' }
const pond = { layer: 'water', kind: 'pond', status: 'active' }
const draft = { layer: 'structures', kind: 'shed', status: 'draft', source: 'ai' }

test('a plant is planned until it is marked as planted', () => {
  assert.equal(isPlannedPlant(planned), true)
  assert.equal(isPlannedPlant({ ...planned, planted_on: null }), true)
  assert.equal(isPlannedPlant(planted), false)
  assert.equal(isPlannedPlant(patch), false)
  assert.equal(isPlannedPlant(pond), false)
  assert.equal(isPlannedPlant(null), false)
})

test('the projected situation shows everything', () => {
  for (const f of [planned, planted, patch, pond, draft]) assert.equal(inScenario(f, 'projected'), true)
  assert.equal(scenarioFilter('projected'), null)
})

test('the current situation leaves out planned plants and drafts', () => {
  assert.deepEqual(
    [planned, planted, patch, pond, draft].map((f) => inScenario(f, 'current')),
    [false, true, true, true, false],
  )
})

test('the MapLibre filters agree with the JavaScript tests', () => {
  const evaluate = (filter: unknown, properties: Record<string, unknown>) =>
    featureFilter(filter as never, 'layers[0].filter').filter({ zoom: 18 }, { type: 1, properties, geometry: [] } as never)
  for (const f of [planned, planted, patch, pond, draft, { ...planned, planted_on: null }]) {
    assert.equal(evaluate(PLANNED_PLANT_EXPR, f), isPlannedPlant(f), JSON.stringify(f))
    assert.equal(evaluate(scenarioFilter('current'), f), inScenario(f, 'current'), JSON.stringify(f))
  }
})

test('an unknown stored value falls back to the projected situation', () => {
  assert.equal(parseScenario('current'), 'current')
  assert.equal(parseScenario('projected'), 'projected')
  assert.equal(parseScenario(null), 'projected')
  assert.equal(parseScenario('futur'), 'projected')
})
