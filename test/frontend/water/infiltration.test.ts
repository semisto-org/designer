import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classOf, emptyingHours, measure, nextReadingMinutes } from '../../../app/frontend/map/water/infiltration.ts'

const readings = (...pairs: Array<[number, number]>) => pairs.map(([minutes, depth]) => ({ t_s: minutes * 60, depth_cm: depth }))

test('a ring gives the drop over the time, like the server', () => {
  const result = measure('ring', 15, readings([0, 10], [10, 8], [20, 6], [30, 4]))
  assert.equal(result.rateMmH, 120)
  assert.equal(result.stable, true)
  assert.equal(classOf(result.rateMmH), 'rapid')
})

test('a hole follows Porchet', () => {
  const result = measure('hole', 30, readings([0, 25], [15, 23], [30, 21.1], [45, 19.3]))
  assert.ok(Math.abs(result.intervals[0].rateMmH - (75 * Math.log(325 / 305)) / 0.25) < 1e-9)
  assert.equal(result.stable, true)
  assert.equal(classOf(result.rateMmH), 'moderate')
})

test('a refill starts a new series, and a soil still soaking up is not stable', () => {
  const refilled = measure('ring', 15, readings([0, 5], [10, 1], [12, 10], [22, 9], [32, 8]))
  assert.equal(refilled.intervals.length, 3)
  assert.equal(refilled.rateMmH, 60)
  const soaking = measure('ring', 15, readings([0, 20], [10, 14], [20, 11], [30, 9]))
  assert.equal(soaking.stable, false)
  assert.equal(soaking.rateMmH, 120)
  assert.equal(measure('ring', 15, readings([0, 10], [10, 9])).rateMmH, null)
})

test('the next reading comes after about a centimetre, and swales empty at the measured rate', () => {
  assert.equal(nextReadingMinutes(null), 15)
  assert.equal(nextReadingMinutes(120), 5)
  assert.equal(nextReadingMinutes(20), 30)
  assert.equal(nextReadingMinutes(40), 15)
  assert.equal(emptyingHours(0.4, 20), 20)
  assert.equal(emptyingHours(0.4, 0), null)
})
