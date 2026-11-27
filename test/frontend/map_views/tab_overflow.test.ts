import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tabsOnLine } from '../../../app/frontend/lib/tabOverflow.ts'

test('every tab stays on the line when they all fit, with no « Plus »', () => {
  assert.deepEqual(tabsOnLine([100, 100, 100], 300, 80, 0), [0, 1, 2])
})

test('the tabs that do not fit beside « Plus » go under it, in order', () => {
  assert.deepEqual(tabsOnLine([100, 100, 100, 100], 350, 80, 0), [0, 1])
})

test('the current tab stays on the line, in place of the last one that fitted', () => {
  assert.deepEqual(tabsOnLine([100, 100, 100, 100], 350, 80, 3), [0, 3])
})

test('a wide current tab can push out several tabs', () => {
  assert.deepEqual(tabsOnLine([60, 60, 60, 200], 300, 80, 3), [3])
})

test('on a very narrow line, the current tab still shows', () => {
  assert.deepEqual(tabsOnLine([100, 100, 100], 120, 80, 1), [1])
})
