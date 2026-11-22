import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boxBlur, MAX_PAINT_PX, noiseSampler, paintWatercolor, seedOf, valueNoise, WOBBLE_MM } from '../../../app/frontend/map/drawing/watercolor.ts'

const MM = 8 // px per printed mm in these tests

/** A white sheet with a dark green square (a pond, a crown) drawn on it. */
function plan(width = 160, height = 120, square = { x: 50, y: 40, size: 40 }) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = square.y; y < square.y + square.size; y++) {
    for (let x = square.x; x < square.x + square.size; x++) {
      const i = (y * width + x) * 4
      data[i] = 40; data[i + 1] = 90; data[i + 2] = 50
    }
  }
  return { data, width, height }
}

/** Where the pigment is: the centre of what is darker than the paper. */
function inkCentre({ data, width, height }: { data: Uint8ClampedArray; width: number; height: number }) {
  let sx = 0, sy = 0, count = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    if (data[i + 1] < 170) { sx += x; sy += y; count++ }
  }
  return { x: sx / count, y: sy / count, count }
}

test('a box blur keeps the light it spreads', () => {
  const src = new Float32Array(50 * 40).map((_, i) => (i % 7) / 7)
  const out = boxBlur(src, 50, 40, 3)
  const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length
  assert.ok(Math.abs(mean(out) - mean(src)) < 0.02)
  assert.ok(Math.max(...out) < Math.max(...src))
})

test('noise is smooth, in [0, 1], and the same for the same seed', () => {
  const a = valueNoise(40, 30, 10, 7)
  assert.deepEqual(a, valueNoise(40, 30, 10, 7))
  assert.notDeepEqual(a, valueNoise(40, 30, 10, 8))
  assert.ok(a.every((v) => v >= 0 && v <= 1))
  assert.ok(Math.abs(a[1] - a[0]) < 0.2)
})

test('the painting keeps every shape where the plan put it, and adds nothing', () => {
  const src = plan()
  const painted = paintWatercolor(src, { mm: MM, seed: 3 })
  const before = inkCentre(src)
  const after = inkCentre(painted)
  // The hand trembles by at most WOBBLE_MM: the square has not moved.
  assert.ok(Math.abs(after.x - before.x) <= WOBBLE_MM * MM)
  assert.ok(Math.abs(after.y - before.y) <= WOBBLE_MM * MM)
  assert.ok(Math.abs(after.count - before.count) / before.count < 0.15)
  // Far from the square, only paper: nothing appears that was not drawn.
  const corner = (5 * painted.width + 5) * 4
  assert.ok(painted.data[corner] > 220 && painted.data[corner + 1] > 215 && painted.data[corner + 2] > 200)
})

test('white becomes cream paper and the wash pools at its edge', () => {
  const painted = paintWatercolor(plan(), { mm: MM, seed: 3 })
  const at = (x: number, y: number) => painted.data[(y * painted.width + x) * 4 + 1]
  // Paper is warm, never pure white.
  assert.ok(painted.data[(5 * painted.width + 5) * 4 + 2] < 245)
  // Just inside the square's edge is darker, on average, than its middle.
  let edge = 0, middle = 0
  for (let y = 50; y < 70; y++) { edge += at(52, y) + at(87, y); middle += at(68, y) + at(72, y) }
  assert.ok(edge < middle)
})

test('one plan, one painting', () => {
  assert.equal(seedOf('maps/3|Le Clos'), seedOf('maps/3|Le Clos'))
  assert.notEqual(seedOf('maps/3|Le Clos'), seedOf('maps/4|Le Clos'))
  assert.deepEqual(paintWatercolor(plan(), { mm: MM, seed: 9 }).data, paintWatercolor(plan(), { mm: MM, seed: 9 }).data)
})

test('an A0 painting stays within what a modest machine holds', () => {
  // The long side is capped at MAX_PAINT_PX before painting (watercolorDataUrl).
  const width = MAX_PAINT_PX
  const height = Math.round(MAX_PAINT_PX * 841 / 1189)
  const src = { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height }
  global.gc?.()
  const before = process.memoryUsage().arrayBuffers
  const painted = paintWatercolor(src, { mm: width / 1189, seed: 1 })
  const used = process.memoryUsage().arrayBuffers - before
  assert.equal(painted.width, width)
  // Eight float channels and the output, not seventeen fields: well under 300 MB.
  assert.ok(used < 300 * 1024 * 1024, `${Math.round(used / 1048576)} MB`)
})

test('noise read pixel by pixel is the same field', () => {
  const field = valueNoise(30, 20, 6, 4)
  const at = noiseSampler(30, 20, 6, 4)
  assert.equal(Math.fround(at(7, 11)), field[11 * 30 + 7])
})
