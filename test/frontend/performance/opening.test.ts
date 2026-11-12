import { test } from 'node:test'
import assert from 'node:assert/strict'
import { busySeconds, gpuClass, openingSpeed, plausibleProps, sizeBucket, staysBusy, type OpeningMeasure } from '../../../app/frontend/map/performance/opening.ts'

const measure = (over: Partial<OpeningMeasure> = {}): OpeningMeasure => ({
  toIdleMs: 1500, longTasksMs: 300, idleRedraws: 0, idleBusySeconds: 0, pageAgeMs: 200, features: 120, plants: 80, ...over,
})

test('openingSpeed: by time to idle or by main-thread long tasks', () => {
  assert.equal(openingSpeed(measure()), 'fast')
  assert.equal(openingSpeed(measure({ toIdleMs: 5000 })), 'ok')
  assert.equal(openingSpeed(measure({ toIdleMs: 9000 })), 'slow')
  assert.equal(openingSpeed(measure({ longTasksMs: 3500 })), 'slow')
  // Safari and Firefox give no long tasks: time alone decides.
  assert.equal(openingSpeed(measure({ longTasksMs: null })), 'fast')
})

test('staysBusy: a map that keeps drawing second after second', () => {
  // A card folding moves the map: one burst of 40 redraws, then quiet.
  assert.equal(staysBusy(measure({ idleRedraws: 41, idleBusySeconds: 1 })), false)
  assert.equal(staysBusy(measure({ idleRedraws: 37, idleBusySeconds: 10 })), true)
  // Someone touched the page: the count says nothing.
  assert.equal(staysBusy(measure({ idleRedraws: null, idleBusySeconds: null })), false)
})

test('busySeconds: one-second slots with a redraw', () => {
  assert.equal(busySeconds([], 1000, 10), 0)
  // A burst: 40 redraws within half a second.
  assert.equal(busySeconds(Array.from({ length: 40 }, (_, i) => 1200 + i * 12), 1000, 10), 1)
  // A loop: four redraws a second for ten seconds.
  assert.equal(busySeconds(Array.from({ length: 40 }, (_, i) => 1000 + i * 250), 1000, 10), 10)
  // Before idle or after the window: not counted.
  assert.equal(busySeconds([500, 11_500], 1000, 10), 0)
})

test('gpuClass: from the WebGL renderer string', () => {
  assert.equal(gpuClass('ANGLE (Intel, Intel(R) HD Graphics 6000, OpenGL 4.1)'), 'integrated')
  assert.equal(gpuClass('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'), 'apple')
  assert.equal(gpuClass('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)'), 'discrete')
  assert.equal(gpuClass('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'software')
  assert.equal(gpuClass(null), 'unknown')
})

test('plausibleProps: buckets only, never the map or the machine itself', () => {
  const props = plausibleProps(measure({ plants: 800 }), { cores: 4, memoryGb: 8, pixelRatio: 2, gpu: 'Intel HD Graphics 6000' })
  assert.deepEqual(props, { speed: 'fast', busy: 'no', plants: '500-999', cores: '3-4', gpu: 'integrated' })
  assert.equal(sizeBucket(0), '<50')
  assert.equal(sizeBucket(1200), '1000+')
})
