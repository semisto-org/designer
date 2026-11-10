import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySimilarity, IDENTITY, invertSimilarity, lngLat, mercator, metersBetween, rotationDeg, similarity, sourceTiles, tileTransform,
  type LngLat,
} from '../../../app/frontend/drone/alignment.ts'

const east = ([lng, lat]: LngLat, meters: number): LngLat => [lng + meters / (111_320 * Math.cos((lat * Math.PI) / 180)), lat]
const north = ([lng, lat]: LngLat, meters: number): LngLat => [lng, lat + meters / 110_574]
const close = (actual: number, expected: number, tolerance: number) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`)

test('mercator units go there and back', () => {
  const point: LngLat = [4.8754, 50.3275]
  const [lng, lat] = lngLat(mercator(point))
  close(lng, point[0], 1e-10)
  close(lat, point[1], 1e-10)
})

test('no landmark leaves the view where it is; one moves it without turning it', () => {
  assert.deepEqual(similarity([]), IDENTITY)
  const from: LngLat = [4.8754, 50.3275]
  const s = similarity([{ from, to: east(from, 3) }])
  assert.equal(s.a, 1)
  assert.equal(s.b, 0)
  const moved = lngLat(applySimilarity(s, mercator(north(from, 20))))
  close(metersBetween(moved, east(north(from, 20), 3)), 0, 0.001)
})

test('two landmarks land exactly where they were placed, turning the view', () => {
  const a: LngLat = [4.8750, 50.3275]
  const b: LngLat = [4.8760, 50.3280]
  const pairs = [{ from: a, to: north(east(a, 1), 0.5) }, { from: b, to: north(east(b, 0.2), 2) }]
  const s = similarity(pairs)
  pairs.forEach(({ from, to }) => close(metersBetween(lngLat(applySimilarity(s, mercator(from))), to), 0, 0.001))
  assert.ok(Math.abs(rotationDeg(s)) > 0.01)
  const back = applySimilarity(invertSimilarity(s), applySimilarity(s, mercator(a)))
  close(back[0], mercator(a)[0], 1e-12)
  close(back[1], mercator(a)[1], 1e-12)
})

test('a tile of the moved view is drawn from the source tiles around it', () => {
  const z = 18
  const n = 2 ** z
  // Half a tile to the east.
  const s = { a: 1, b: 0, tu: 0.5 / n, tv: 0 }
  assert.deepEqual(sourceTiles(s, z, 1000, 2000), { x0: 999, x1: 1000, y0: 2000, y1: 2000 })
  const [, , , , e, f] = tileTransform(s, z, 1000, 2000)
  // Source pixel x = 1000 * 256 lands at 128 in the tile.
  close(1000 * 256 + e, 128, 1e-6)
  close(2000 * 256 + f, 0, 1e-6)
  assert.deepEqual(sourceTiles(IDENTITY, z, 5, 7), { x0: 5, x1: 5, y0: 7, y1: 7 })
})
