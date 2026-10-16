import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calibrateRates } from '../../../app/frontend/relief/soil.ts'

test('one test scales the whole soil, roofs stay dry', () => {
  const rate = new Float32Array([10, 10, 0, 20])
  const factor = calibrateRates(rate, 2, 2, 2, [{ x: 1, y: 1, rate: 30 }])
  assert.ok(Math.abs(factor - 3) < 1e-6)
  assert.deepEqual([...rate].map((v) => Math.round(v)), [30, 30, 0, 60])
})

test('two tests each pull their own side of the field', () => {
  const rate = new Float32Array(10).fill(10)
  calibrateRates(rate, 10, 1, 1, [{ x: 0.5, y: 0.5, rate: 40 }, { x: 9.5, y: 0.5, rate: 2.5 }])
  assert.ok(Math.abs(rate[0] - 40) < 4, `west ${rate[0]}`)
  assert.ok(Math.abs(rate[9] - 2.5) < 0.3, `east ${rate[9]}`)
  assert.ok(Math.abs(rate[4] * rate[5] - 100) < 5, 'the middle is the geometric mean')
})

test('a test off the grid changes nothing', () => {
  const rate = new Float32Array([10, 10])
  assert.equal(calibrateRates(rate, 2, 1, 1, [{ x: -5, y: 0, rate: 50 }]), 1)
  assert.deepEqual([...rate], [10, 10])
})
