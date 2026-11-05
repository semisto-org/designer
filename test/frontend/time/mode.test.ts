import { test } from 'node:test'
import assert from 'node:assert/strict'
import { featureFilter } from '@maplibre/maplibre-gl-style-spec'
import { modeForMoment, modeForStage, modeOfMoment, momentForMode, parseMode } from '../../../app/frontend/map/time/mode.ts'
import { inMoment, momentFilter } from '../../../app/frontend/map/time/moment.ts'

const ARRIVAL = '2024-09-01'
const plant = (props: Record<string, unknown> = {}) => ({ layer: 'plants', kind: 'plant', status: 'active', species_id: 3, ...props })
const apple = plant({ planted_on: '2024-12-05' })
const plannedPlant = plant()
const draft = plant({ status: 'draft', source: 'ai' })
const pond = { layer: 'water', kind: 'pond', status: 'active' }
const plannedPond = { ...pond, planned: true }
const builtShed = { layer: 'structures', kind: 'shed', status: 'active', built_on: '2025-06-01' }
const fence = { layer: 'structures', kind: 'fence', status: 'active', to_remove: true }
const felled = { layer: 'existing', kind: 'existing_tree', status: 'active', removed_on: '2025-02-10' }
const ALL = { apple, plannedPlant, draft, pond, plannedPond, builtShed, fence, felled }

test('each step of the journey has its mode: the land first, then the project', () => {
  assert.equal(modeForStage('observe'), 'existing')
  assert.equal(modeForStage('map'), 'existing')
  assert.equal(modeForStage('design'), 'project')
  assert.equal(modeForStage('plant'), 'project')
  assert.equal(modeForStage(null), 'existing')
})

test('a remembered mode is read back, anything else is not', () => {
  assert.equal(parseMode('existing'), 'existing')
  assert.equal(parseMode('project'), 'project')
  assert.equal(parseMode('plan'), null)
  assert.equal(parseMode(null), null)
})

test('arrival belongs to the land, the years to come to the project, today to both', () => {
  assert.equal(modeOfMoment('arrival'), 'existing')
  assert.equal(modeOfMoment('today'), null)
  assert.equal(modeOfMoment('year15'), 'project')
  assert.equal(modeForMoment('project', 'arrival'), 'existing')
  assert.equal(modeForMoment('existing', 'year5'), 'project')
  assert.equal(modeForMoment('existing', 'today'), 'existing')
  assert.equal(modeForMoment('project', 'today'), 'project')
})

test('switching mode keeps the moment when it belongs to it, else comes back to today', () => {
  assert.equal(momentForMode('year30', 'existing'), 'today')
  assert.equal(momentForMode('arrival', 'project'), 'today')
  assert.equal(momentForMode('arrival', 'existing'), 'arrival')
  assert.equal(momentForMode('year5', 'project'), 'year5')
  assert.equal(momentForMode('today', 'existing'), 'today')
})

const shown = (mode: 'existing' | 'project') =>
  Object.entries(ALL).filter(([, p]) => inMoment(p, 'today', ARRIVAL, mode)).map(([name]) => name).sort()

test('today in « Existant » shows only what is on the ground, today in « Projet » adds the plan', () => {
  assert.deepEqual(shown('existing'), ['apple', 'builtShed', 'fence', 'pond'])
  assert.deepEqual(shown('project'), ['apple', 'builtShed', 'fence', 'plannedPlant', 'plannedPond', 'pond'])
})

test('the MapLibre filter of today in « Existant » agrees with inMoment', () => {
  const filter = featureFilter(momentFilter('today', ARRIVAL, 'existing') as never, 'layers[0].filter')
  for (const [name, properties] of Object.entries(ALL)) {
    const kept = filter.filter({ zoom: 17 } as never, { type: 1, properties, geometry: [] } as never)
    assert.equal(kept, inMoment(properties, 'today', ARRIVAL, 'existing'), name)
  }
})

test('the mode changes nothing on arrival or in the years to come', () => {
  for (const moment of ['arrival', 'year5', 'year30'] as const) {
    for (const [name, properties] of Object.entries(ALL)) {
      assert.equal(inMoment(properties, moment, ARRIVAL, 'existing'), inMoment(properties, moment, ARRIVAL, 'project'), `${moment} ${name}`)
    }
  }
})
