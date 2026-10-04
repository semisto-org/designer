import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialViewId } from '../../../app/frontend/drone/store.ts'

const view = (id: number, capturedOn: string) => ({ id, name: 'Vue drone', capturedOn, kind: 'pmtiles' as const, url: 'https://x/a.pmtiles', attribution: null, minZoom: null, maxZoom: null })
// Newest capture first, as the server sends them.
const views = [view(4, '2027-05-12'), view(7, '2026-09-03'), view(2, '2026-06-21')]

test('no view, nothing shown', () => {
  assert.equal(initialViewId([], null), null)
})

test('a first visit shows the view delivered last', () => {
  assert.equal(initialViewId(views, null), 7)
})

test('the remembered choice is kept, « Sans vue drone » included', () => {
  assert.equal(initialViewId(views, { viewId: 2, latestSeen: 7 }), 2)
  assert.equal(initialViewId(views, { viewId: null, latestSeen: 7 }), null)
})

test('a view delivered since the last visit is shown first, even over « Sans vue drone »', () => {
  assert.equal(initialViewId(views, { viewId: null, latestSeen: 4 }), 7)
})

test('a remembered view that was removed falls back to the newest capture', () => {
  assert.equal(initialViewId(views, { viewId: 9, latestSeen: 9 }), 4)
})
