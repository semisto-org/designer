import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flyStep, noFlyKeys, type FlyKeys } from '../../../app/frontend/relief/flyKeys.ts'
import { headingOf } from '../../../app/frontend/relief/heading.ts'

const limits = { minDistance: 5, maxDistance: 1000, halfWidth: 100, halfDepth: 100 }
// South of the target, 40 m back and 30 m up, looking north.
const camera = { x: 0, y: 30, z: 40 }
const target = { x: 0, y: 0, z: 0 }
const keys = (patch: Partial<FlyKeys>): FlyKeys => ({ ...noFlyKeys(), ...patch })
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`)

test('no key, no move', () => {
  const next = flyStep(camera, target, noFlyKeys(), 0.1, limits)
  assert.deepEqual(next, { camera, target })
})

test('up moves forward, where the camera looks, keeping the height', () => {
  const next = flyStep(camera, target, keys({ up: true }), 0.1, limits)
  // 50 m away × 0.6 × 0.1 s = 3 m towards the north.
  close(next.target.z, -3)
  close(next.target.x, 0)
  close(next.camera.z, 37)
  close(next.camera.y, 30)
})

test('right slides east when facing north, left slides west', () => {
  close(flyStep(camera, target, keys({ right: true }), 0.1, limits).target.x, 3)
  close(flyStep(camera, target, keys({ left: true }), 0.1, limits).target.x, -3)
})

test('the target stays over the terrain', () => {
  const next = flyStep(camera, { x: 99, y: 0, z: 0 }, keys({ right: true }), 1, limits)
  close(next.target.x, 100)
})

test('Shift + right turns the view clockwise around the target', () => {
  const before = headingOf(camera, target)
  const next = flyStep(camera, target, keys({ right: true, turn: true }), 0.1, limits)
  assert.ok(headingOf(next.camera, target) > before)
  assert.deepEqual(next.target, target)
  close(Math.hypot(next.camera.x, next.camera.y, next.camera.z), 50)
})

test('Shift + up comes closer, Shift + down moves away, within the limits', () => {
  const closer = flyStep(camera, target, keys({ up: true, turn: true }), 0.1, limits).camera
  assert.ok(Math.hypot(closer.x, closer.y, closer.z) < 50)
  const away = flyStep(camera, target, keys({ down: true, turn: true }), 0.1, limits).camera
  assert.ok(Math.hypot(away.x, away.y, away.z) > 50)
  const floor = flyStep(camera, target, keys({ up: true, turn: true }), 100, limits).camera
  close(Math.hypot(floor.x, floor.y, floor.z), 5)
})
