import { test } from 'node:test'
import assert from 'node:assert/strict'
import { centeredScrollLeft } from '../../../app/frontend/lib/activeTab.ts'

test('a tab cut off at the right comes to the centre of its row', () => {
  // Row 0–390 px, tab at 500–600: scroll by 500 - (390 - 100) / 2 = 355.
  assert.equal(centeredScrollLeft(0, 1000, { left: 0, width: 390 }, { left: 500, width: 100 }), 355)
})

test('the scroll stays within the row', () => {
  assert.equal(centeredScrollLeft(0, 1000, { left: 0, width: 390 }, { left: 10, width: 80 }), 0)
  assert.equal(centeredScrollLeft(0, 200, { left: 0, width: 390 }, { left: 500, width: 100 }), 200)
})

test('an already scrolled row counts from where it is', () => {
  assert.equal(centeredScrollLeft(100, 1000, { left: 16, width: 390 }, { left: 216, width: 100 }), 155)
})
