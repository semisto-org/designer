import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clusterLabel, layoutNumbers, pastilleRadius, spreadNumbers } from '../../../app/frontend/map/plants/numberLayout.ts'

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

test('a cluster says which plants it holds: a run of numbers, or the first and how many more', () => {
  assert.equal(clusterLabel([127, 125, 126, 128]), '125–128')
  assert.equal(clusterLabel([125, 140, 131, 133, 129]), '125 +4')
})

test('isolated plants stay on their point, two that touch step aside by one pastille only', () => {
  const { placements, clusters } = layoutNumbers([
    { id: 1, x: 0, y: 0, number: 1 },
    { id: 2, x: 5, y: 0, number: 2 },
    { id: 3, x: 300, y: 0, number: 3 },
  ], 10, 2)
  assert.equal(clusters.length, 0)
  const byId = new Map(placements.map((p) => [p.id, p]))
  assert.deepEqual(byId.get(1), { id: 1, x: 0, y: 0, moved: false })
  assert.deepEqual(byId.get(3), { id: 3, x: 300, y: 0, moved: false })
  const second = byId.get(2)!
  assert.equal(second.moved, true)
  // A short leader: one pastille away from its plant, never across the bed.
  assert.ok(Math.abs(distance(second, { x: 5, y: 0 }) - 22) < 1e-6)
})

test('a multi-strata bed becomes one pill instead of a firework of leader lines', () => {
  // Thirty plants within a 30 px square, as a bed seen from afar, and one plant away from it.
  const bed = Array.from({ length: 30 }, (_, i) => ({ id: i, x: (i * 7) % 30, y: Math.floor(i / 5) * 5, number: 125 + i }))
  const { placements, clusters } = layoutNumbers([...bed, { id: 99, x: 400, y: 400, number: 7 }], 10, 2)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].ids.length, 30)
  assert.equal(clusters[0].label, '125–154')
  assert.deepEqual(placements, [{ id: 99, x: 400, y: 400, moved: false }])
})

test('the selected plant keeps its pastille out of the cluster around it', () => {
  const bed = Array.from({ length: 6 }, (_, i) => ({ id: i, x: i * 3, y: 0, number: i + 1, selected: i === 2 }))
  const { placements, clusters } = layoutNumbers(bed, 10, 2)
  assert.deepEqual(placements, [{ id: 2, x: 6, y: 0, moved: false }])
  assert.deepEqual(clusters[0].ids, [0, 1, 3, 4, 5])
  assert.equal(clusters[0].label, '1 +4')
})

test('three touching plants still step aside, a fourth makes them a pill', () => {
  // Three on the same spot: the ring around holds them, so they spread.
  const three = layoutNumbers([0, 1, 2].map((i) => ({ id: i, x: 0, y: 0, number: i + 1 })), 10, 2)
  assert.equal(three.clusters.length, 0)
  assert.equal(three.placements.filter((p) => p.moved).length, 2)
  // Four become a pill.
  const four = layoutNumbers([0, 1, 2, 3].map((i) => ({ id: i, x: i, y: 0, number: i + 1 })), 10, 2)
  assert.deepEqual(four.clusters.map((c) => c.label), ['1–4'])
})
