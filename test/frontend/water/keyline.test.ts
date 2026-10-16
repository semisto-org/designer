import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampCount, DEFAULT_SPACING, parallelProperties, totalLength, useOf } from '../../../app/frontend/map/water/keyline.ts'

test('a parallel keeps the use of its keyline, and a swale its section', () => {
  assert.deepEqual(parallelProperties({ role: 'keyline', use: 'swale', width_m: 1.2, depth_m: 0.3 }), { role: 'parallel', use: 'swale', width_m: 1.2, depth_m: 0.3 })
  assert.deepEqual(parallelProperties({ role: 'keyline', use: 'trees', width_m: 1.2 }), { role: 'parallel', use: 'trees' })
  assert.deepEqual(parallelProperties({}), { role: 'parallel', use: 'swale' })
})

test('spacing follows the use, counts stay within bounds', () => {
  assert.equal(DEFAULT_SPACING[useOf('trees')], 12)
  assert.equal(DEFAULT_SPACING[useOf(undefined)], 20)
  assert.equal(clampCount('3'), 3)
  assert.equal(clampCount(42), 10)
  assert.equal(clampCount('-1'), 0)
  assert.equal(clampCount('trois'), 0)
  const line = { geometry: { type: 'LineString' as const, coordinates: [] }, offsetM: 10, side: 'above' as const, rank: 1, fallM: 0.4 }
  assert.equal(totalLength([{ ...line, lengthM: 40 }, { ...line, lengthM: 22.5 }]), 62.5)
})
