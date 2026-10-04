import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onSingleClick } from '../../../app/frontend/map/singleClick.ts'

type Listener = (event: string) => void

function fakeMap() {
  const listeners: Record<string, Set<Listener>> = { click: new Set(), dblclick: new Set() }
  return {
    on(type: 'click' | 'dblclick', l: Listener) { listeners[type].add(l) },
    off(type: 'click' | 'dblclick', l: Listener) { listeners[type].delete(l) },
    fire(type: 'click' | 'dblclick', event = type) { listeners[type].forEach((l) => l(event)) },
    count: () => listeners.click.size + listeners.dblclick.size,
  }
}

test('a single click reaches the handler once the double-click window has passed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const map = fakeMap()
  const seen: string[] = []
  onSingleClick(map, (e) => seen.push(e), 300)
  map.fire('click', 'here')
  assert.deepEqual(seen, [])
  t.mock.timers.tick(300)
  assert.deepEqual(seen, ['here'])
})

test('a double-click (click, click, dblclick) never reaches the handler', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const map = fakeMap()
  const seen: string[] = []
  onSingleClick(map, (e) => seen.push(e), 300)
  map.fire('click')
  t.mock.timers.tick(120)
  map.fire('click')
  map.fire('dblclick')
  t.mock.timers.tick(1000)
  assert.deepEqual(seen, [])
})

test('unsubscribing removes the listeners and drops a pending click', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const map = fakeMap()
  const seen: string[] = []
  const off = onSingleClick(map, (e) => seen.push(e), 300)
  map.fire('click')
  off()
  t.mock.timers.tick(1000)
  assert.deepEqual(seen, [])
  assert.equal(map.count(), 0)
})
