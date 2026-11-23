import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pastilleRadius, spreadNumbers } from '../../../app/frontend/map/plants/numberLayout.ts'

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

test('plants far apart keep their pastille on their point', () => {
  const placed = spreadNumbers([{ id: 1, x: 0, y: 0 }, { id: 2, x: 100, y: 0 }], 10)
  assert.deepEqual(placed, [{ id: 1, x: 0, y: 0, moved: false }, { id: 2, x: 100, y: 0, moved: false }])
})

test('in a crowd no two pastilles touch, and the first by number stays on its plant', () => {
  // Thirty plants within a 30 px square, as a multi-strata bed seen from afar.
  const points = Array.from({ length: 30 }, (_, i) => ({ id: i, x: (i * 7) % 30, y: Math.floor(i / 5) * 5 }))
  const placed = spreadNumbers(points, 10, 2)
  assert.deepEqual(placed[0], { id: 0, x: 0, y: 0, moved: false })
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) assert.ok(distance(placed[i], placed[j]) >= 22 - 1e-6, `${i} and ${j} touch`)
  }
  // Each one stays close to its plant: within a few pastilles.
  for (const p of placed) assert.ok(distance(p, points[p.id]) < 22 * 5)
})

test('a pastille stepping aside goes away from the one it would cover', () => {
  const [, second] = spreadNumbers([{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }], 10, 2)
  assert.equal(second.moved, true)
  assert.ok(second.x > 4, 'moved to the right, away from the first')
  assert.ok(Math.abs(distance(second, { x: 4, y: 0 }) - 22) < 1e-6)
})

test('the pastille grows with the zoom, as the disc layer draws it', () => {
  assert.equal(pastilleRadius(14), 7.5)
  assert.equal(pastilleRadius(17), 10.5)
  assert.equal(pastilleRadius(18.5), 12.5)
  assert.equal(pastilleRadius(21), 14.5)
})
