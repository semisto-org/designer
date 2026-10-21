import { test } from 'node:test'
import assert from 'node:assert/strict'
import { featureFilter } from '@maplibre/maplibre-gl-style-spec'
import {
  addYears, availableMoments, inMoment, momentDate, momentFilter, nextPlantingSeason, parseMoment, plantAge, shownMoment, timeline,
  type Moment,
} from '../../../app/frontend/map/time/moment.ts'

const ARRIVAL = '2024-09-01'
const plant = (props: Record<string, unknown> = {}) => ({ layer: 'plants', kind: 'plant', status: 'active', species_id: 3, ...props })
const oldOak = plant({ planted_on: '2024-09-01', planted_on_precision: 'unknown' })
const beforeArrival = plant({ planted_on: '2019-03-01' })
const apple = plant({ planted_on: '2024-12-05' })
const planned = plant()
const draft = plant({ status: 'draft', source: 'ai' })
const pond = { layer: 'water', kind: 'pond', status: 'active' }
const plannedPond = { ...pond, planned: true }
const shed = { layer: 'structures', kind: 'shed', status: 'active', built_on: '2025-06-01' }
const oldShed = { ...shed, built_on: '2010-06-01' }
const ALL = [oldOak, beforeArrival, apple, planned, draft, pond, plannedPond, shed, oldShed]

test('the next planting season: now from November to March, else the coming 1 November', () => {
  assert.equal(nextPlantingSeason('2026-10-20'), '2026-11-01')
  assert.equal(nextPlantingSeason('2026-04-01'), '2026-11-01')
  assert.equal(nextPlantingSeason('2026-12-03'), '2026-12-03')
  assert.equal(nextPlantingSeason('2027-02-14'), '2027-02-14')
})

test('year 0 is the first planting since arrival, else the next planting season', () => {
  assert.equal(timeline(ALL, '2026-10-20', ARRIVAL).origin, '2024-12-05')
  // An old tree, or one planted before the map was made, is not the garden's start.
  assert.equal(timeline([oldOak, beforeArrival, planned], '2026-10-20', ARRIVAL).origin, '2026-11-01')
  // Drafts do not count.
  assert.equal(timeline([plant({ status: 'draft', planted_on: '2025-01-01' })], '2026-10-20', ARRIVAL).origin, '2026-11-01')
})

test('each stop has its date; years already behind the garden are not offered', () => {
  const line = timeline(ALL, '2026-10-20', ARRIVAL)
  assert.equal(momentDate('arrival', line), ARRIVAL)
  assert.equal(momentDate('today', line), '2026-10-20')
  assert.equal(momentDate('year5', line), '2029-12-05')
  assert.equal(momentDate('year30', line), '2054-12-05')
  assert.deepEqual(availableMoments(line), ['arrival', 'today', 'year5', 'year15', 'year30'])
  const old = timeline([plant({ planted_on: '2010-01-15' })], '2026-10-20', '2009-06-01')
  assert.deepEqual(availableMoments(old), ['arrival', 'today', 'year30'])
  assert.equal(shownMoment('year5', old), 'today')
  assert.equal(shownMoment('year30', old), 'year30')
  assert.equal(addYears('2024-02-29', 1), '2025-03-01')
})

test('what shows at each moment', () => {
  const at = (moment: Moment) => ALL.map((f) => inMoment(f, moment, ARRIVAL))
  // oak, before arrival, apple, planned, draft, pond, planned pond, shed (2025), old shed
  assert.deepEqual(at('arrival'), [true, true, false, false, false, true, false, false, true])
  assert.deepEqual(at('today'), [true, true, true, true, false, true, true, true, true])
  for (const moment of ['year5', 'year15', 'year30'] as Moment[]) assert.deepEqual(at(moment), ALL.map(() => true))
})

test('the MapLibre filters agree with inMoment', () => {
  const evaluate = (filter: unknown, properties: Record<string, unknown>) =>
    filter == null || featureFilter(filter as never, 'layers[0].filter').filter({ zoom: 18 }, { type: 1, properties, geometry: [] } as never)
  for (const moment of ['arrival', 'today', 'year5', 'year30'] as Moment[]) {
    for (const f of ALL) assert.equal(evaluate(momentFilter(moment, ARRIVAL), f), inMoment(f, moment, ARRIVAL), `${moment} ${JSON.stringify(f)}`)
  }
})

test('a plant\'s age at each moment', () => {
  const line = timeline(ALL, '2026-10-20', ARRIVAL)
  assert.equal(plantAge(oldOak, 'today', line), 'adult')
  assert.equal(plantAge(oldOak, 'arrival', line), 'adult')
  assert.ok(Math.abs((plantAge(apple, 'today', line) as number) - 1.87) < 0.01)
  assert.ok(Math.abs((plantAge(apple, 'year15', line) as number) - 15) < 0.01)
  assert.equal(plantAge(apple, 'arrival', line), null)
  // Planned: the plan's adult footprint today, planted at the next season afterwards.
  assert.equal(plantAge(planned, 'arrival', line), null)
  assert.equal(plantAge(planned, 'today', line), 'adult')
  assert.ok(Math.abs((plantAge(planned, 'year5', line) as number) - 3.09) < 0.01)
  assert.ok(Math.abs((plantAge(beforeArrival, 'arrival', line) as number) - 5.5) < 0.01)
})

test('an unknown stored moment falls back to today', () => {
  assert.equal(parseMoment('year15'), 'year15')
  assert.equal(parseMoment('projected'), 'today')
  assert.equal(parseMoment(null), 'today')
})
