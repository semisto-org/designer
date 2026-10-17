import { test } from 'node:test'
import assert from 'node:assert/strict'
import { storageAdvice } from '../../../app/frontend/map/storage/advice.ts'
import { chartDomain, dayNumber, scale } from '../../../app/frontend/map/storage/chart.ts'

test('a warm, dry store gets the two matching pieces of advice', () => {
  assert.deepEqual(storageAdvice({ temperature: { status: 'bad', side: 'warm' }, humidity: { status: 'bad', side: 'dry' }, overall: 'bad' }), ['warm_bad', 'dry_bad'])
  assert.deepEqual(storageAdvice({ temperature: { status: 'fair', side: 'warm' }, humidity: { status: 'fair', side: 'wet' }, overall: 'fair' }), ['warm_fair', 'wet'])
  assert.deepEqual(storageAdvice({ temperature: { status: 'frost', side: 'cold' }, humidity: null, overall: 'frost' }), ['frost'])
  assert.deepEqual(storageAdvice({ temperature: { status: 'good', side: null }, humidity: { status: 'good', side: null }, overall: 'good' }), [])
  assert.deepEqual(storageAdvice(null), [])
})

test('the chart spans at least a month and always shows the good band', () => {
  const reading = (measuredOn: string, temperatureC: number) => ({ id: 1, featureId: 1, measuredOn, temperatureC, temperatureMinC: null, temperatureMaxC: null, humidityPct: null, note: null, author: null, verdict: { temperature: null, humidity: null, overall: null } })
  const domain = chartDomain([reading('2026-10-03', 18)], (r) => [r.temperatureC], [0.5, 6])
  assert.equal(domain.x[1] - domain.x[0], 30)
  assert.ok(domain.y[0] <= 0.5 && domain.y[1] >= 18)
  assert.equal(dayNumber('2026-01-02') - dayNumber('2026-01-01'), 1)
  assert.equal(scale([0, 10], [0, 100])(5), 50)
  assert.equal(scale([3, 3], [0, 100])(3), 50)
})
