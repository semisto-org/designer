import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitRoof, mainAxis, roofHeight, shell, type RoofSample } from '../../../app/frontend/relief/roofs.ts'

// A 12 m × 8 m house, its long side east–west (x), closed ring.
const ring = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 0 }]

function samples(height: (x: number, y: number) => number): RoofSample[] {
  const out: RoofSample[] = []
  for (let y = 1; y < 8; y++) for (let x = 1; x < 12; x++) out.push({ x, y, z: height(x, y) })
  return out
}

test('the main axis follows the long side', () => {
  assert.ok(Math.abs(Math.sin(mainAxis(ring))) < 1e-9)
})

test('a gable roof: ridge along the long side, eaves and ridge at their height', () => {
  // Eaves at 5 m, ridge at 9 m in the middle (y = 4): 45°.
  const shape = fitRoof(ring, samples((_, y) => 9 - Math.abs(y - 4)), 7)
  assert.equal(shape.type, 'gable')
  assert.ok(Math.abs(roofHeight(shape, { x: 6, y: 4 }) - 9) < 0.05)
  assert.ok(Math.abs(roofHeight(shape, { x: 6, y: 0 }) - 5) < 0.05)

  const built = shell(ring, shape, 2.2, 150)
  assert.equal(built.faces.length, 2, 'two slopes')
  assert.equal(built.ring.length, 6, 'a corner at each gable end')
  const peaks = built.ring.filter((p) => p.top > 8.9)
  assert.equal(peaks.length, 2)
})

test('noise around a flat roof stays flat', () => {
  let seed = 7
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.4
  const shape = fitRoof(ring, samples(() => 6 + noise()), 7)
  assert.equal(shape.type, 'flat')
  const built = shell(ring, shape, 2.2, 150)
  assert.equal(built.faces.length, 1)
  assert.equal(built.ring.length, 4)
})

test('a single slope (lean-to)', () => {
  const shape = fitRoof(ring, samples((_, y) => 3 + y * 0.4), 4)
  assert.equal(shape.type, 'shed')
  assert.ok(Math.abs(roofHeight(shape, { x: 6, y: 8 }) - roofHeight(shape, { x: 6, y: 0 }) - 3.2) < 0.05)
})

test('too few samples: flat at the fallback height', () => {
  assert.deepEqual(fitRoof(ring, [], 7), { type: 'flat', height: 7 })
})
