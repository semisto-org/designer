import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contains, corners, initialPose, moved, planImageIdOf, planImagesMove, rotatedTowards, scaledTo, toLocal,
  type Pose,
} from '../../../app/frontend/map/plan_images/pose.ts'

// Beauvechain, a 40 m × 20 m plan.
const pose: Pose = { centerLng: 4.77, centerLat: 50.78, widthM: 40, rotation: 0, aspect: 2 }
const close = (a: number, b: number, tolerance = 0.01) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≉ ${b}`)

test('ids carry the plan image id, nothing else does', () => {
  assert.equal(planImageIdOf('plan-image-7'), 7)
  assert.equal(planImageIdOf('aerial-view-7'), null)
  assert.equal(planImageIdOf(undefined), null)
})

test('a north-up image has its corners 20 m east/west and 10 m north/south of its center', () => {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners(pose).map((c) => toLocal(pose, c))
  close(topLeft[0], -20); close(topLeft[1], 10)
  close(topRight[0], 20); close(topRight[1], 10)
  close(bottomRight[0], 20); close(bottomRight[1], -10)
  close(bottomLeft[0], -20); close(bottomLeft[1], -10)
})

test('a quarter turn clockwise brings the top left corner to the north east', () => {
  const [topLeft] = corners({ ...pose, rotation: 90 }).map((c) => toLocal(pose, c))
  close(topLeft[0], 10); close(topLeft[1], 20)
})

test('a point is on the image only inside its rotated outline', () => {
  const at = (east: number, north: number) => [pose.centerLng + east / (111320 * Math.cos(50.78 * Math.PI / 180)), pose.centerLat + north / 111320] as [number, number]
  assert.ok(contains(pose, at(15, 8)))
  assert.ok(!contains(pose, at(15, 12)))
  assert.ok(contains({ ...pose, rotation: 90 }, at(8, 15)))
  assert.ok(!contains({ ...pose, rotation: 90 }, at(15, 8)))
})

test('dragging moves the center by the same distance', () => {
  const next = moved(pose, [4.77, 50.78], [4.771, 50.781])
  close(next.centerLng, 4.771, 1e-9); close(next.centerLat, 50.781, 1e-9)
  assert.equal(next.widthM, 40)
})

test('pulling a corner twice as far doubles the width and keeps the ratio', () => {
  const [, topRight] = corners(pose)
  const farther: [number, number] = [pose.centerLng + 2 * (topRight[0] - pose.centerLng), pose.centerLat + 2 * (topRight[1] - pose.centerLat)]
  const next = scaledTo(pose, farther)
  close(next.widthM, 80); assert.equal(next.aspect, 2)
})

test('the rotation handle turns the top towards the pointer, clockwise from north', () => {
  close(rotatedTowards(pose, [4.771, 50.78]).rotation, 90)
  close(rotatedTowards(pose, [4.769, 50.78]).rotation, 270)
  close(rotatedTowards(pose, [4.77, 50.779]).rotation, 180)
})

test('a new image takes half of the view, less when it is tall', () => {
  close(initialPose([4.77, 50.78], 200, 100, 2).widthM, 100)
  close(initialPose([4.77, 50.78], 200, 100, 0.5).widthM, 25)
})

const isFloor = (id: string) => ['background', 'osm', 'region-ortho', 'aerial-view-2'].includes(id)

test('plan images go right above the base map and the drone view, under the drawing', () => {
  const order = ['background', 'osm', 'region-ortho', 'aerial-view-2', 'region-cadastre', 'features-fill', 'plan-image-3']
  assert.deepEqual(planImagesMove(order, ['plan-image-3'], isFloor), { before: 'region-cadastre' })
})

test('nothing moves when they are in place and in order', () => {
  const order = ['background', 'region-ortho', 'plan-image-3', 'plan-image-5', 'features-fill']
  assert.equal(planImagesMove(order, ['plan-image-3', 'plan-image-5'], isFloor), null)
  assert.deepEqual(planImagesMove(order, ['plan-image-5', 'plan-image-3'], isFloor), { before: 'features-fill' })
})
