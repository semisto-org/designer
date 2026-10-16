import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seasonOf, soilState, stormHistory, toLocalInput, waterOf } from '../../../app/frontend/map/water/storm.ts'

test('the water follows the shape unless it is said', () => {
  assert.equal(waterOf({}, 'LineString'), 'flows')
  assert.equal(waterOf({}, 'Polygon'), 'pools')
  assert.equal(waterOf({}, 'Point'), 'seeps')
  assert.equal(waterOf({ water: 'pools' }, 'Point'), 'pools')
})

test('meteorological seasons', () => {
  assert.equal(seasonOf(new Date(2026, 11, 3)), 'winter')
  assert.equal(seasonOf(new Date(2026, 1, 28)), 'winter')
  assert.equal(seasonOf(new Date(2026, 2, 1)), 'spring')
  assert.equal(seasonOf(new Date(2026, 6, 14)), 'summer')
  assert.equal(seasonOf(new Date(2026, 9, 16)), 'autumn')
})

test('how wet the soil was before', () => {
  assert.equal(soilState(0), 'dry')
  assert.equal(soilState(8), 'moist')
  assert.equal(soilState(31), 'wet')
})

test('the history keeps the observations with a time, most recent first', () => {
  const feature = (id: number, observed_at: unknown, extra: Record<string, unknown> = {}) =>
    ({ properties: { id, kind: 'storm_observation', status: 'active', observed_at, ...extra }, geometry: { type: 'LineString' } })
  const history = stormHistory([
    feature(1, '2026-02-03T14:20:00Z', { rain: 'storm' }),
    feature(2, '2026-10-01T08:00:00Z'),
    feature(3, 'hier'),
    feature(4, '2026-05-01T08:00:00Z', { status: 'rejected' }),
    { properties: { id: 5, kind: 'pond', observed_at: '2026-01-01T00:00:00Z' }, geometry: { type: 'Polygon' } },
  ])
  assert.deepEqual(history.map((h) => h.id), [2, 1])
  assert.equal(history[1].rain, 'storm')
  assert.equal(history[1].water, 'flows')
})

test('a time for a datetime-local field', () => {
  assert.equal(toLocalInput('nope'), '')
  assert.match(toLocalInput('2026-02-03T14:20:00Z'), /^2026-02-03T\d\d:20$/)
})
