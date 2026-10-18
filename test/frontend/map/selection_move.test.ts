import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distance } from '@turf/turf'
import type { Point, Polygon } from 'geojson'
import { idsWithin, toggled, translateGeometry } from '../../../app/frontend/map/selection/move.ts'

const from = [4.95, 50.32]
const to = [4.9503, 50.3201]

test('elements moved together keep their spacing', () => {
  const a: Point = { type: 'Point', coordinates: [4.9501, 50.3202] }
  const b: Point = { type: 'Point', coordinates: [4.9512, 50.3195] }
  const before = distance(a.coordinates, b.coordinates, { units: 'meters' })
  const movedA = translateGeometry(a, from, to) as Point
  const movedB = translateGeometry(b, from, to) as Point
  assert.ok(Math.abs(distance(movedA.coordinates, movedB.coordinates, { units: 'meters' }) - before) < 0.01)
  // Each one travels as far as the cursor did.
  const travel = distance(from, to, { units: 'meters' })
  assert.ok(Math.abs(distance(a.coordinates, movedA.coordinates, { units: 'meters' }) - travel) < 0.01)
})

test('a polygon moves as a whole, with every vertex', () => {
  const zone: Polygon = { type: 'Polygon', coordinates: [[[4.95, 50.32], [4.951, 50.32], [4.951, 50.321], [4.95, 50.32]]] }
  const moved = translateGeometry(zone, from, to) as Polygon
  assert.equal(moved.coordinates[0].length, 4)
  assert.ok(moved.coordinates[0][0][0] > zone.coordinates[0][0][0])
  assert.ok(moved.coordinates[0][0][1] > zone.coordinates[0][0][1])
})

test('no movement leaves the geometry as it is', () => {
  const point: Point = { type: 'Point', coordinates: [4.95, 50.32] }
  assert.equal(translateGeometry(point, from, from), point)
})

test('Shift+click adds an element, then takes it out', () => {
  assert.deepEqual(toggled([], 5, null), [5])
  assert.deepEqual(toggled([5], 6, null), [5, 6])
  assert.deepEqual(toggled([5, 6], 5, null), [6])
})

test('the element already open in the inspector joins the selection', () => {
  assert.deepEqual(toggled([], 6, 5), [5, 6])
  assert.deepEqual(toggled([], 5, 5), [])
})

test('a Shift+drag box takes what lies entirely inside it, not the wide zone it crosses', () => {
  const box: Polygon = { type: 'Polygon', coordinates: [[[4.950, 50.320], [4.952, 50.320], [4.952, 50.322], [4.950, 50.322], [4.950, 50.320]]] }
  const features = [
    { type: 'Feature' as const, properties: { id: 1 }, geometry: { type: 'Point' as const, coordinates: [4.951, 50.321] } },
    { type: 'Feature' as const, properties: { id: 2 }, geometry: { type: 'Polygon' as const, coordinates: [[[4.949, 50.319], [4.953, 50.319], [4.953, 50.323], [4.949, 50.323], [4.949, 50.319]]] } },
    { type: 'Feature' as const, properties: { id: 3 }, geometry: { type: 'Point' as const, coordinates: [4.9512, 50.3212] } },
  ]
  // Element 3 is inside but hidden (no hit): it stays out too.
  assert.deepEqual(idsWithin(features, [{ id: 1 }, { id: 2 }, { id: null }], box), [1])
})
