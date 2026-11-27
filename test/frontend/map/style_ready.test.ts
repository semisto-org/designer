import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whenStyleReady } from '../../../app/frontend/map/layers/styleReady.ts'

// A map stand-in: `style` goes null when Safari takes the WebGL context
// back, and a restored style throws until it has loaded again.
function fakeMap() {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    style: {} as object | null,
    once(type: string, fn: () => void) { (listeners[type] ??= []).push(fn) },
    off(type: string, fn: () => void) { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn) },
    fire(type: string) { const fns = listeners[type] ?? []; listeners[type] = []; fns.forEach((fn) => fn()) },
  }
}

test('runs at once when the style is ready', () => {
  const map = fakeMap()
  let runs = 0
  whenStyleReady(map as never, () => { runs++ })
  assert.equal(runs, 1)
})

test('waits for the restored style after a lost WebGL context, then runs', () => {
  const map = fakeMap()
  map.style = null
  let runs = 0
  whenStyleReady(map as never, () => { runs++ })
  assert.equal(runs, 0)
  map.style = {}
  map.fire('idle')
  assert.equal(runs, 1)
})

test('a style still loading is retried once the map is idle', () => {
  const map = fakeMap()
  let loaded = false
  let runs = 0
  whenStyleReady(map as never, () => {
    if (!loaded) throw new Error('Style is not done loading.')
    runs++
  })
  assert.equal(runs, 0)
  loaded = true
  map.fire('idle')
  assert.equal(runs, 1)
})

test('any other error is not swallowed', () => {
  const map = fakeMap()
  assert.throws(() => whenStyleReady(map as never, () => { throw new TypeError('bug') }), /bug/)
})

test('a cancelled wait does not run later', () => {
  const map = fakeMap()
  map.style = null
  let runs = 0
  const cancel = whenStyleReady(map as never, () => { runs++ })
  cancel()
  map.style = {}
  map.fire('idle')
  assert.equal(runs, 0)
})
