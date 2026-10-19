import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMoveShortcut, moveTarget } from '../../../app/frontend/map/drawing/moveShortcut.ts'

const key = (key: string, extra: Partial<{ code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, ...extra })

test('M alone starts a move, in either case and on any layout', () => {
  assert.equal(isMoveShortcut(key('m')), true)
  assert.equal(isMoveShortcut(key('M')), true)
  assert.equal(isMoveShortcut(key(',', { code: 'KeyM' })), true)
})

test('M with a modifier, or another key, does not', () => {
  assert.equal(isMoveShortcut(key('m', { metaKey: true })), false)
  assert.equal(isMoveShortcut(key('m', { ctrlKey: true })), false)
  assert.equal(isMoveShortcut(key('µ', { altKey: true, code: 'KeyM' })), false)
  assert.equal(isMoveShortcut(key('n')), false)
})

test('the open plant card wins over the inspector', () => {
  assert.deepEqual(moveTarget({ peekedId: 4, selectedId: 9, selection: [] }), { id: 4, from: 'peek' })
  assert.deepEqual(moveTarget({ peekedId: null, selectedId: 9, selection: [] }), { id: 9, from: 'inspector' })
})

test('nothing open, or several elements selected: M does nothing', () => {
  assert.equal(moveTarget({ peekedId: null, selectedId: null, selection: [] }), null)
  assert.equal(moveTarget({ peekedId: 4, selectedId: null, selection: [4, 5] }), null)
})
