import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDrainage } from '../../../app/frontend/relief/hydro.ts'
import { coldAirField, coldAirGround, coldLayer, LAYER_AT_DAWN, nightClock } from '../../../app/frontend/relief/coldAir.ts'

const cols = 41
const rows = 41
// A V valley along the columns (bottom at column 20), descending to the south.
const valley = Float32Array.from({ length: cols * rows }, (_, i) => {
  const c = i % cols
  const r = Math.floor(i / cols)
  return 100 + Math.abs(c - 20) * 0.3 - r * 0.05
})

test('cold air slides towards the valley bottom', () => {
  const field = coldAirField(valley, null, analyzeDrainage(valley, cols, rows, 1), cols, rows, 1)
  const west = 20 * cols + 5
  const east = 20 * cols + 35
  assert.ok(field.dirX[west] > 0.9, 'west slope flows east')
  assert.ok(field.dirX[east] < -0.9, 'east slope flows west')
  assert.ok(field.slope[west] > 0.25)
})

test('the cold layer is absent at dusk and thickest in the bottom at dawn', () => {
  const drainage = analyzeDrainage(valley, cols, rows, 1)
  const field = coldAirField(valley, null, drainage, cols, rows, 1)
  // A small grid: let the whole valley floor count as a drain.
  field.hand.set(coldAirField(valley, null, { ...drainage, accumulation: drainage.accumulation.map((a) => a * 5000) }, cols, rows, 1).hand)
  assert.ok(coldLayer(field, 0).every((d) => d === 0))
  const dawn = coldLayer(field, 1)
  const bottom = 30 * cols + 20
  const slope = 30 * cols + 2
  assert.ok(Math.abs(dawn[bottom] - LAYER_AT_DAWN) < 0.5, `bottom ${dawn[bottom]}`)
  assert.ok(dawn[slope] < dawn[bottom])
  assert.ok(coldLayer(field, 0.25)[bottom] < dawn[bottom])
})

test('a closed hollow fills with cold air', () => {
  const flat = new Float32Array(15 * 15).fill(10)
  flat[7 * 15 + 7] = 8
  const field = coldAirField(flat, null, analyzeDrainage(flat, 15, 15, 1), 15, 15, 1)
  assert.ok(coldLayer(field, 1)[7 * 15 + 7] >= 2)
})

test('a hedge raises the ground the cold air slides on, a tree crown too but capped', () => {
  const ground = new Float32Array([10, 10, 10])
  const surface = new Float32Array([10.5, 12, 30])
  assert.deepEqual([...coldAirGround(ground, surface)], [10, 12, 14])
  assert.deepEqual([...coldAirGround(ground, null)], [10, 10, 10])
})

test('the night runs from 21:00 to 07:00', () => {
  assert.equal(nightClock(0), 21 * 60)
  assert.equal(nightClock(0.3), 0)
  assert.equal(nightClock(1), 7 * 60)
})
