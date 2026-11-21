import assert from 'node:assert/strict'
import { test } from 'node:test'
import { masterLayout, spreadMarks } from '../../../app/frontend/map/drawing/masterPlanLayout.ts'

test('landscape: the map on the left, the column on the right, the title block at its foot', () => {
  const l = masterLayout('A3', 'landscape')
  assert.equal(l.width, 420)
  assert.equal(l.k, 1)
  assert.ok(l.frame.x + l.frame.w < l.text.x)
  assert.equal(l.columns, 1)
  assert.ok(l.text.y + l.text.h <= l.cartouche.y)
  assert.ok(Math.abs(l.cartouche.y + l.cartouche.h - (l.height - 10)) < 1e-6)
})

test('portrait: the map on top, a band of columns below; lettering grows with the sheet', () => {
  const a3 = masterLayout('A3', 'portrait')
  const a0 = masterLayout('A0', 'portrait')
  assert.ok(a3.frame.y + a3.frame.h < a3.text.y)
  assert.ok(a3.columns >= 2)
  assert.ok(Math.abs(a0.k - 841 / 297) < 1e-9)
  assert.ok(a0.frame.w / a3.frame.w > 2.8)
})

test('numbers on one another are spread apart, clear ones stay put', () => {
  const [a, b, c] = spreadMarks([{ x: 10, y: 10 }, { x: 10.5, y: 10 }, { x: 50, y: 50 }], 2)
  assert.deepEqual(a, { x: 10, y: 10 })
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 4.2 - 1e-9)
  assert.deepEqual(c, { x: 50, y: 50 })
})
