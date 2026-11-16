import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RenderLoop, type FrameClock } from '../../../app/frontend/relief/renderLoop.ts'

// A display that ticks when told, at 120 Hz (every 8.33 ms).
function display(hz = 120) {
  let now = 0
  let next = 1
  const pending = new Map<number, (now: number) => void>()
  let hidden = false
  const clock: FrameClock = {
    request: (callback) => { pending.set(next, callback); return next++ },
    cancel: (id) => { pending.delete(id) },
    hidden: () => hidden,
  }
  return {
    clock,
    /** Runs `count` display frames. */
    run(count: number) {
      for (let i = 0; i < count; i++) {
        now += 1000 / hz
        const callbacks = [...pending.values()]
        pending.clear()
        for (const callback of callbacks) callback(now)
      }
    },
    hide(on: boolean) { hidden = on },
    get waiting() { return pending.size },
  }
}

test('draws once, then rests while nothing changes', () => {
  const screen = display()
  const loop = new RenderLoop(() => false, screen.clock)
  loop.invalidate()
  screen.run(240)
  assert.equal(loop.frames, 1)
  assert.equal(screen.waiting, 0)
  assert.ok(loop.idle)
})

test('a change asks for exactly one new image', () => {
  const screen = display()
  const loop = new RenderLoop(() => false, screen.clock)
  loop.invalidate()
  screen.run(10)
  loop.invalidate()
  loop.invalidate()
  screen.run(10)
  assert.equal(loop.frames, 2)
})

test('while moving, 60 images a second at most on a 120 Hz screen', () => {
  const screen = display(120)
  const loop = new RenderLoop(() => true, screen.clock)
  loop.invalidate()
  screen.run(120)
  assert.ok(loop.frames >= 59 && loop.frames <= 61, `${loop.frames} images`)
})

test('a 60 Hz screen keeps every frame', () => {
  const screen = display(60)
  const loop = new RenderLoop(() => true, screen.clock)
  loop.invalidate()
  screen.run(60)
  assert.equal(loop.frames, 60)
})

test('stops when the movement ends', () => {
  const screen = display()
  let left = 5
  const loop = new RenderLoop(() => --left > 0, screen.clock)
  loop.invalidate()
  screen.run(100)
  assert.equal(loop.frames, 5)
  assert.ok(loop.idle)
})

test('a change made while drawing asks for the next image', () => {
  const screen = display()
  let steps = 3
  const loop: RenderLoop = new RenderLoop(() => {
    if (--steps > 0) loop.invalidate()
    return false
  }, screen.clock)
  loop.invalidate()
  screen.run(100)
  assert.equal(loop.frames, 3)
})

test('nothing is drawn while the tab is hidden, the change waits for its return', () => {
  const screen = display()
  const loop = new RenderLoop(() => false, screen.clock)
  screen.hide(true)
  loop.invalidate()
  screen.run(100)
  assert.equal(loop.frames, 0)
  screen.hide(false)
  loop.resume()
  screen.run(2)
  assert.equal(loop.frames, 1)
})

test('stop cancels the pending image', () => {
  const screen = display()
  const loop = new RenderLoop(() => true, screen.clock)
  loop.invalidate()
  loop.stop()
  loop.invalidate()
  screen.run(10)
  assert.equal(loop.frames, 0)
  assert.equal(screen.waiting, 0)
})
