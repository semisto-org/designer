import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detailFrame } from '../../../app/frontend/map/drawing/detailSheets.ts'
import { clusterLetter } from '../../../app/frontend/map/plants/numberLayout.ts'

// An A4 landscape frame, in mm.
const frame = { w: 267, h: 150 }

test('a small bed is detailed at 1/50, centred on its plants', () => {
  // About 4 × 3 m (a metre of room each side) around Beauvechain.
  const { scale, center } = detailFrame([4.7700, 50.7800, 4.77006, 50.78003], frame, 500)
  assert.equal(scale, 50)
  assert.ok(Math.abs(center[0] - 4.77003) < 1e-9 && Math.abs(center[1] - 50.780015) < 1e-9)
})

test('a wider bed goes to 1/100, then 1/200, never coarser than the plan', () => {
  // About 14 m wide: too wide for 1/50 on A4.
  assert.equal(detailFrame([4.77, 50.78, 4.7702, 50.78005], frame, 500).scale, 100)
  // About 28 m wide.
  assert.equal(detailFrame([4.77, 50.78, 4.7704, 50.78005], frame, 500).scale, 200)
  // A plan already at 1/100: the detail is closer.
  assert.equal(detailFrame([4.7700, 50.7800, 4.77006, 50.78003], frame, 100).scale, 50)
})

test('detail sheets are lettered A to Z, then AA', () => {
  assert.deepEqual([0, 1, 25, 26, 27].map(clusterLetter), ['A', 'B', 'Z', 'AA', 'AB'])
})
