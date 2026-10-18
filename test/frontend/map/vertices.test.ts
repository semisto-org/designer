import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LineString, Polygon, Position } from 'geojson'
import { editableVertices, insertVertex, removeVertex, sideAt, vertexAt } from '../../../app/frontend/map/editor/vertices.ts'

// One degree is one hundred pixels, y down like the screen.
const project = ([x, y]: Position) => ({ x: x * 100, y: -y * 100 })

const square: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
const line: LineString = { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] }

test('a polygon edits its outline without the closing copy of its first point', () => {
  assert.deepEqual(editableVertices(square), [[0, 0], [1, 0], [1, 1], [0, 1]])
})

test('the point under the pointer is found within the tolerance, the nearest first', () => {
  assert.equal(vertexAt(square, { x: 103, y: -4 }, project), 1)
  assert.equal(vertexAt(square, { x: 50, y: -50 }, project), -1)
})

test('a click on a side gives the side and the spot on it, the closing side included', () => {
  const side = sideAt(square, { x: 50, y: 5 }, project)
  assert.equal(side?.index, 0)
  assert.equal(side?.at.x, 50)
  assert.equal(Math.abs(side?.at.y ?? 1), 0)
  assert.equal(sideAt(square, { x: -3, y: -50 }, project)?.index, 3)
  assert.equal(sideAt(line, { x: 150, y: 40 }, project), null)
})

test('a point added on a side lands between its two ends, the polygon stays closed', () => {
  const added = insertVertex(square, 3, [0, 0.5]) as Polygon
  assert.deepEqual(added.coordinates[0], [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0.5], [0, 0]])
  assert.deepEqual((insertVertex(line, 0, [0.5, 0]) as LineString).coordinates, [[0, 0], [0.5, 0], [1, 0], [2, 0]])
})

test('removing the first point of a polygon closes it on the next one', () => {
  assert.deepEqual((removeVertex(square, 0) as Polygon).coordinates[0], [[1, 0], [1, 1], [0, 1], [1, 0]])
  assert.deepEqual((removeVertex(line, 1) as LineString).coordinates, [[0, 0], [2, 0]])
})

test('a line keeps two points and a polygon three', () => {
  const triangle = removeVertex(square, 2) as Polygon
  assert.equal(removeVertex(triangle, 0), null)
  assert.equal(removeVertex(removeVertex(line, 1) as LineString, 0), null)
})

test('holes are kept as they are', () => {
  const holed: Polygon = { type: 'Polygon', coordinates: [...square.coordinates, [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.2]]] }
  assert.deepEqual((insertVertex(holed, 0, [0.5, 0]) as Polygon).coordinates[1], holed.coordinates[1])
})
