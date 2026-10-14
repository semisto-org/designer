import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eighthOf, headingOf, letterPosition } from '../../../app/frontend/relief/heading.ts'

// Local frame: x east, z south.
test('heading of a camera follows the direction it looks', () => {
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`)
  close(headingOf({ x: 0, z: 10 }, { x: 0, z: 0 }), 0) // looking north
  close(headingOf({ x: -10, z: 0 }, { x: 0, z: 0 }), Math.PI / 2) // looking east
  close(Math.abs(headingOf({ x: 0, z: -10 }, { x: 0, z: 0 })), Math.PI) // looking south
  close(headingOf({ x: 10, z: 0 }, { x: 0, z: 0 }), -Math.PI / 2) // looking west
  // Straight down, north up (topView): the camera sits a hair south of its target.
  close(headingOf({ x: 0, z: 0.001 }, { x: 0, z: 0 }), 0)
})

test('eighths name the eight compass points', () => {
  assert.equal(eighthOf(0), 0)
  assert.equal(eighthOf(44), 1)
  assert.equal(eighthOf(90), 2)
  assert.equal(eighthOf(-90), 6)
  assert.equal(eighthOf(350), 0)
  assert.equal(eighthOf(-180), 4)
})

test('letters turn the other way round from the view', () => {
  const round = ({ x, y }: { x: number; y: number }) => ({ x: Math.round(x), y: Math.round(y) })
  assert.deepEqual(round(letterPosition(0, 0, 30)), { x: 50, y: 20 }) // N on top facing north
  assert.deepEqual(round(letterPosition(0, 90, 30)), { x: 20, y: 50 }) // facing east, N on the left
  assert.deepEqual(round(letterPosition(90, 90, 30)), { x: 50, y: 20 }) // and E on top
})
