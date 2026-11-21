import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ContourField, lineLength, locate, simplify, slice } from '../../../app/frontend/relief/contourTrace.ts'
import { WaterTool, ring } from '../../../app/frontend/relief/waterTool.ts'

// 60 × 60 cells of 1 m: a slope falling 5 cm per metre to the south (rows),
// so every contour runs east–west along a row.
function slope(cols = 60, rows = 60): Float32Array {
  const z = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) z[r * cols + c] = 100 - r * 0.05
  return z
}

// A round hill: contours are closed rings around (30, 30).
function hill(n = 60): Float32Array {
  const z = new Float32Array(n * n)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) z[r * n + c] = 100 - Math.hypot(c - 30, r - 30) * 0.1
  return z
}

test('a contour on a plain slope runs along the row, at the height of the point', () => {
  const field = new ContourField(slope(), 60, 60, 1)
  const line = field.trace(20.3, 30.5)
  assert.ok(line)
  assert.equal(line.closed, false)
  for (const p of line.points) assert.ok(Math.abs(p.r - 30.5) < 0.01, `row ${p.r}`)
  assert.ok(Math.abs(line.level - (100 - 30.5 * 0.05)) < 1e-3)
  // From one edge of the grid to the other (the smoothing keeps the heights of a plane).
  assert.ok(lineLength(line.points) > 55)
})

test('a contour around a hill closes on itself', () => {
  const field = new ContourField(hill(), 60, 60, 1)
  const line = field.trace(40.2, 30.1)
  assert.ok(line)
  assert.equal(line.closed, true)
  for (const p of line.points) assert.ok(Math.abs(Math.hypot(p.c - 30, p.r - 30) - Math.hypot(10.2, 0.1)) < 0.3)
})

test('flat ground has no contour', () => {
  const field = new ContourField(new Float32Array(400).fill(50), 20, 20, 1)
  assert.equal(field.trace(10.5, 10.5), null)
  assert.equal(field.trace(-3, 5), null)
})

test('locate, slice and simplify work along the line', () => {
  const points = [{ c: 0, r: 0 }, { c: 5, r: 0 }, { c: 10, r: 0 }]
  assert.deepEqual(locate(points, { c: 7, r: 2 }), { along: 7, distance: 2 })
  const piece = slice({ points, level: 0, closed: false }, 8, 2)
  assert.equal(lineLength(piece), 6)
  assert.deepEqual(simplify(points), [{ c: 0, r: 0 }, { c: 10, r: 0 }])
})

test('the shorter way round on a closed line', () => {
  const square = ring({ c: 0, r: 0 }, 10, 4)
  const total = lineLength(square)
  const piece = slice({ points: square, level: 0, closed: true }, total * 0.1, total * 0.9)
  assert.ok(Math.abs(lineLength(piece) - total * 0.2) < 1e-6)
})

test('a swale snaps to the contour of its first point, wherever the cursor goes', () => {
  const field = new ContourField(slope(), 60, 60, 1)
  const tool = new WaterTool('swale', field, 1)
  const before = tool.hover({ c: 20, r: 30 })
  assert.ok(before.guide && before.guide.length >= 2)
  assert.equal(before.anchor, null)
  assert.equal(tool.click({ c: 20, r: 30 }), null)
  assert.ok(tool.placing)
  // The cursor drifts 8 m downhill: the swale stays on the row of its start.
  const sketch = tool.hover({ c: 45, r: 38 })
  assert.ok(sketch.trace)
  for (const p of sketch.trace) assert.ok(Math.abs(p.r - 30) < 0.01)
  assert.ok(Math.abs((sketch.lengthM ?? 0) - 25) < 0.5)
  const work = tool.click({ c: 45, r: 38 })
  assert.ok(work)
  assert.equal(work.kind, 'swale')
  assert.equal(work.closed, false)
  // A straight level line keeps only its two ends.
  assert.equal(work.points.length, 2)
  assert.ok(Math.abs((work.level ?? 0) - (100 - 30 * 0.05)) < 1e-3)
})

test('a swale shorter than 2 m is not done yet', () => {
  const tool = new WaterTool('swale', new ContourField(slope(), 60, 60, 1), 1)
  tool.click({ c: 20, r: 30 })
  assert.equal(tool.click({ c: 21, r: 30 }), null)
})

test('a pond is a ring from its centre to the click, within bounds', () => {
  const tool = new WaterTool('pond', new ContourField(slope(), 60, 60, 1), 0.5)
  tool.click({ c: 20, r: 20 })
  const sketch = tool.hover({ c: 26, r: 28 })
  assert.equal(sketch.radiusM, 5)
  assert.ok(Math.abs((sketch.areaM2 ?? 0) - Math.PI * 25) < 1e-6)
  const work = tool.click({ c: 26, r: 28 })
  assert.ok(work)
  assert.equal(work.closed, true)
  assert.deepEqual(work.points[0], work.points[work.points.length - 1])
  // Too small: not done.
  const small = new WaterTool('mound', new ContourField(slope(), 60, 60, 1), 0.5)
  small.click({ c: 20, r: 20 })
  assert.equal(small.click({ c: 21, r: 20 }), null)
})
