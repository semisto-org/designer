import { test } from 'node:test'
import assert from 'node:assert/strict'
import { designedRoof, fitRoof, mainAxis, roofHeight, shell, type RoofSample } from '../../../app/frontend/relief/roofs.ts'

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

// ---- Roofs the person gives a drawn building ---------------------------------

test('a drawn gable roof: ridge along the long side, at the top, gutters on the long walls', () => {
  const shape = designedRoof(ring, { shape: 'gable', height: 9, eaves: 5, ridge: 'long', flip: false })
  assert.equal(shape.type, 'gable')
  assert.ok(Math.abs(roofHeight(shape, { x: 6, y: 4 }) - 9) < 1e-9)
  assert.ok(Math.abs(roofHeight(shape, { x: 6, y: 0 }) - 5) < 1e-9)
  assert.ok(Math.abs(roofHeight(shape, { x: 0, y: 8 }) - 5) < 1e-9)
  const built = shell(ring, shape, 0.3, 150)
  assert.equal(built.faces.length, 2)
  assert.equal(built.ring.filter((p) => p.top > 8.99).length, 2, 'the gable ends rise to the ridge')
})

test('the ridge across the building puts the gables on the long walls', () => {
  const shape = designedRoof(ring, { shape: 'gable', height: 9, eaves: 5, ridge: 'short', flip: false })
  assert.ok(Math.abs(roofHeight(shape, { x: 6, y: 0 }) - 9) < 1e-9, 'the ridge meets the long wall in its middle')
  assert.ok(Math.abs(roofHeight(shape, { x: 0, y: 4 }) - 5) < 1e-9)
})

test('without gutters given, a 35° pitch', () => {
  const shape = designedRoof(ring, { shape: 'gable', height: 9, eaves: null, ridge: 'long', flip: false })
  const eaves = roofHeight(shape, { x: 6, y: 0 })
  assert.ok(Math.abs(eaves - (9 - 4 * Math.tan((35 * Math.PI) / 180))) < 1e-9)
})

test('a hip roof: four slopes, gutters on every wall, a ridge along the long side', () => {
  const shape = designedRoof(ring, { shape: 'hip', height: 8, eaves: 5, ridge: 'long', flip: false })
  assert.equal(shape.type, 'hip')
  for (const p of ring) assert.ok(Math.abs(roofHeight(shape, p) - 5) < 1e-9, 'gutters at every corner')
  assert.ok(Math.abs(roofHeight(shape, { x: 6, y: 4 }) - 8) < 1e-9)
  assert.ok(Math.abs(roofHeight(shape, { x: 4, y: 4 }) - 8) < 1e-9, 'the ridge runs from x = 4 to x = 8')
  assert.ok(roofHeight(shape, { x: 2, y: 4 }) < 8, 'the hip end slopes down')
  const built = shell(ring, shape, 0.3, 150)
  assert.equal(built.faces.length, 4, 'four slopes')
  const area = built.faces.reduce((sum, face) => {
    let a = 0
    for (let k = 0; k < face.length; k++) {
      const p = face[k]
      const q = face[(k + 1) % face.length]
      a += p.x * q.y - q.x * p.y
    }
    return sum + Math.abs(a) / 2
  }, 0)
  assert.ok(Math.abs(area - 96) < 1e-6, 'the slopes cover the footprint once')
  for (const face of built.faces) {
    for (const p of face) assert.ok(Math.abs(p.h - roofHeight(shape, p)) < 1e-9)
  }
})

test('a single slope, high on one wall, and flipped', () => {
  const shape = designedRoof(ring, { shape: 'shed', height: 6, eaves: 4, ridge: 'long', flip: false })
  const low = roofHeight(shape, { x: 6, y: 0 })
  const high = roofHeight(shape, { x: 6, y: 8 })
  assert.deepEqual([Math.min(low, high), Math.max(low, high)].map((h) => Math.round(h * 1e9) / 1e9), [4, 6])
  const flipped = designedRoof(ring, { shape: 'shed', height: 6, eaves: 4, ridge: 'long', flip: true })
  assert.ok(Math.abs(roofHeight(flipped, { x: 6, y: 0 }) - high) < 1e-9)
  assert.ok(Math.abs(roofHeight(flipped, { x: 6, y: 8 }) - low) < 1e-9)
})

test('a flat roof stays flat, and gutters above the top flatten it', () => {
  assert.deepEqual(designedRoof(ring, { shape: 'flat', height: 7, eaves: null, ridge: 'long', flip: false }), { type: 'flat', height: 7 })
  assert.equal(designedRoof(ring, { shape: 'gable', height: 7, eaves: 9, ridge: 'long', flip: false }).type, 'flat')
})
