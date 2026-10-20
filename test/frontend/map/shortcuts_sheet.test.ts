import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandKey, isShortcutsKey, SHORTCUT_GROUPS } from '../../../app/frontend/map/shortcuts/keys.ts'

const key = (key: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, ...extra })

test('« ? » opens the sheet, not with a modifier', () => {
  assert.equal(isShortcutsKey(key('?')), true)
  assert.equal(isShortcutsKey(key('?', { metaKey: true })), false)
  assert.equal(isShortcutsKey(key('/')), false)
})

test('the modifier follows the computer', () => {
  assert.equal(commandKey('MacIntel'), '⌘')
  assert.equal(commandKey('iPhone'), '⌘')
  assert.equal(commandKey('Win32'), 'Ctrl')
  assert.equal(commandKey('Linux x86_64'), 'Ctrl')
})

test('every row has a key and a label', () => {
  for (const group of SHORTCUT_GROUPS) for (const row of group.rows) {
    assert.ok(row.keys.length > 0)
    assert.ok(row.label)
  }
})
