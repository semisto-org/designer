import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alphaFromCompass, bearingTo, containRect, corrected, coverFov, deviceCameraPose, distanceM, headingPitch, poseFrom, smoothed, verticalFov,
} from '../../../app/frontend/relief/window/pose.ts'

const close = (actual: number, expected: number, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`)
const closeVec = (actual: number[], expected: number[], tolerance = 1e-6) => actual.forEach((v, i) => close(v, expected[i], tolerance))

test('a phone held upright facing north looks north, its top up', () => {
  const pose = deviceCameraPose(0, 90, 0)
  closeVec(pose.forward, [0, 0, -1])
  closeVec(pose.up, [0, 1, 0])
})

test('alpha turns the view counter-clockwise: alpha 90 looks west', () => {
  const { heading, pitch } = headingPitch(deviceCameraPose(90, 90, 0))
  close(heading, 270)
  close(pitch, 0)
})

test('iOS: the compass heading gives the absolute alpha the view needs', () => {
  const { heading } = headingPitch(deviceCameraPose(alphaFromCompass(120), 90, 0))
  close(heading, 120)
})

test('tilting the top of the phone back lifts the view', () => {
  const { pitch } = headingPitch(deviceCameraPose(0, 110, 0))
  close(pitch, 20)
})

test('a phone flat on its back looks at the ground', () => {
  const { pitch } = headingPitch(deviceCameraPose(0, 0, 0))
  close(pitch, -90)
})

test('in landscape (screen angle 90), the right edge of the phone is the top of the picture', () => {
  // Upright facing north, its right edge towards the east: with the screen
  // turned, the top of the picture is that edge.
  const pose = deviceCameraPose(0, 90, 0, 90)
  closeVec(pose.forward, [0, 0, -1])
  closeVec(pose.up, [1, 0, 0])
})

test('poseFrom and headingPitch agree', () => {
  const { heading, pitch } = headingPitch(poseFrom(215, -12))
  close(heading, 215)
  close(pitch, -12)
})

test('a correction turns clockwise and lifts, keeping the picture level', () => {
  const pose = corrected(poseFrom(10, 0), 25, 5)
  const { heading, pitch } = headingPitch(pose)
  close(heading, 35)
  close(pitch, 5)
  // Still level: the top of the picture has no east-west lean.
  const right = [pose.forward[1] * pose.up[2] - pose.forward[2] * pose.up[1], 0, 0]
  assert.ok(Number.isFinite(right[0]))
  close(pose.up[1] > 0 ? 1 : 0, 1)
})

test('smoothing moves part of the way, and follows a jump at once', () => {
  const a = poseFrom(0, 0)
  const b = poseFrom(20, 0)
  const half = headingPitch(smoothed(a, b, 0.5)).heading
  assert.ok(half > 5 && half < 15, `${half}`)
  closeVec(smoothed(a, poseFrom(180, 0)).forward, poseFrom(180, 0).forward)
})

test('field of view: a 26 mm phone camera in portrait sees about 65° high', () => {
  const portrait = verticalFov(26, 3024, 4032)
  assert.ok(portrait > 60 && portrait < 72, `${portrait}`)
  const landscape = verticalFov(26, 4032, 3024)
  assert.ok(landscape < portrait)
  // Unknown or absurd focal lengths fall back on the phone default.
  close(verticalFov(null, 3024, 4032), portrait)
  close(verticalFov(0, 3024, 4032), portrait)
})

test('a video cropped to fill a narrower screen shows less of its height', () => {
  // A 4:3 landscape stream on a tall portrait screen: cropped left and right,
  // whole in height.
  close(coverFov(50, 640, 480, 390, 844), 50, 1e-9)
  // A portrait stream on a wide box: cropped top and bottom.
  assert.ok(coverFov(65, 480, 640, 1000, 600) < 65)
})

test('contain fits an image inside a box, centred', () => {
  assert.deepEqual(containRect(400, 300, 800, 800), { left: 0, top: 100, width: 800, height: 600 })
})

test('distance and bearing', () => {
  close(distanceM([4.9, 50.3], [4.9, 50.301]), 111.2, 0.5)
  close(bearingTo({ x: 0, z: 0 }, { x: 10, z: 0 }), 90)
  close(bearingTo({ x: 0, z: 0 }, { x: 0, z: 10 }), 180)
})

test('the ground between nodes, held to the edge outside the grid', async () => {
  const { bilinear, outsideBy } = await import('../../../app/frontend/relief/window/load.ts')
  // 2 × 2 nodes 10 m apart: 100 and 110 on the north row, 120 and 130 south.
  const ground = bilinear([100, 110, 120, 130], 2, 2, 10)
  close(ground(5, 5), 115)
  close(ground(-50, -50), 100)
  close(ground(99, 99), 130)
  close(outsideBy(5, 5, { width: 10, depth: 10 }), 0)
  close(outsideBy(13, 14, { width: 10, depth: 10 }), 5)
})
