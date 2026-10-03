import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDrainage } from '../../../app/frontend/relief/hydro.ts'
import {
  boxBlur, compassPoint, frostClass, frostRisk, slopeAspect, spreadAccumulation, wetnessClass, wetnessIndex, wetnessThresholdsFor,
} from '../../../app/frontend/relief/station.ts'

test('a slope going down to the south faces south, at its gradient', () => {
  const cols = 5
  const rows = 5
  // Higher in the north (first rows): 20 % slope.
  const heights = Float32Array.from({ length: 25 }, (_, i) => 10 - Math.floor(i / cols) * 0.2)
  const { slope, aspect } = slopeAspect(heights, cols, rows, 1)
  assert.ok(Math.abs(Math.tan(slope[12]) - 0.2) < 1e-6)
  assert.equal(compassPoint(aspect[12]), 's')
})

test('box blur keeps a constant field and smooths a spike', () => {
  const values = new Float32Array(25).fill(1)
  assert.ok(boxBlur(values, 5, 5, 1).every((v) => Math.abs(v - 1) < 1e-6))
  values[12] = 10
  assert.ok(boxBlur(values, 5, 5, 1)[12] < 3)
})

test('a valley bottom is wetter and frostier than its slopes', () => {
  const cols = 41
  const rows = 41
  // A V valley along the columns, descending to the south.
  const heights = Float32Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    return 100 + Math.abs(c - 20) * 0.5 - r * 0.05
  })
  const drainage = analyzeDrainage(heights, cols, rows, 1)
  const { slope } = slopeAspect(heights, cols, rows, 1)
  const twi = wetnessIndex(spreadAccumulation(drainage, cols, rows, 1), slope, 1)
  const bottom = 30 * cols + 20
  const side = 30 * cols + 5
  assert.ok(twi[bottom] > twi[side] + 2)
  const frost = frostRisk(heights, drainage, { channelArea: 200, warmBelt: 5 })
  assert.ok(frost[bottom] > frost[side])
  assert.equal(frostClass(frost[bottom]), 'high')
})

test('wetness classes and thresholds scaled to the cell size', () => {
  assert.equal(wetnessClass(3), 'dry')
  assert.equal(wetnessClass(5), 'fresh')
  assert.equal(wetnessClass(8), 'moist')
  assert.equal(wetnessClass(12), 'wet')
  const coarse = wetnessThresholdsFor(5)
  assert.ok(coarse[0] > 4.5 + 1.5)
  assert.equal(wetnessClass(5, coarse), 'dry')
})
