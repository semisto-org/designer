import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyShortcut, isTextTarget, UndoHistory, type UndoEntry } from '../../../app/frontend/map/editor/history.ts'

const key = (k: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra })

function counter(log: string[], name: string): UndoEntry {
  return { label: name, undo: async () => void log.push(`undo ${name}`), redo: async () => void log.push(`redo ${name}`) }
}

test('the shortcuts of a Mac and of a PC', () => {
  assert.equal(historyShortcut(key('z', { metaKey: true })), 'undo')
  assert.equal(historyShortcut(key('z', { ctrlKey: true })), 'undo')
  assert.equal(historyShortcut(key('Z', { metaKey: true, shiftKey: true })), 'redo')
  assert.equal(historyShortcut(key('y', { ctrlKey: true })), 'redo')
  assert.equal(historyShortcut(key('z')), null)
  assert.equal(historyShortcut(key('z', { metaKey: true, altKey: true })), null)
})

test('typing in a field keeps the text undo', () => {
  assert.equal(isTextTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget), true)
  assert.equal(isTextTarget({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget), true)
  assert.equal(isTextTarget({ tagName: 'INPUT', type: 'checkbox' } as unknown as EventTarget), false)
  assert.equal(isTextTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true)
  assert.equal(isTextTarget({ tagName: 'CANVAS' } as unknown as EventTarget), false)
})

test('undo goes back step by step, redo forward, a new change forgets the undone', async () => {
  const log: string[] = []
  const history = new UndoHistory()
  history.record(counter(log, 'a'))
  history.record(counter(log, 'b'))
  assert.equal((await history.undo())?.label, 'b')
  assert.equal((await history.undo())?.label, 'a')
  assert.equal(await history.undo(), null)
  assert.equal((await history.redo())?.label, 'a')
  history.record(counter(log, 'c'))
  assert.equal(history.canRedo, false)
  assert.deepEqual(log, ['undo b', 'undo a', 'redo a'])
})

test('a group is one step, undone last to first', async () => {
  const log: string[] = []
  const history = new UndoHistory()
  await history.group('all', async () => {
    history.record(counter(log, '1'))
    history.record(counter(log, '2'))
  })
  const entry = await history.undo()
  assert.equal(entry?.label, 'all')
  assert.deepEqual(log, ['undo 2', 'undo 1'])
  assert.equal(history.canUndo, false)
})

test('a step that fails is dropped, the older ones stay', async () => {
  const history = new UndoHistory()
  history.record(counter([], 'old'))
  history.record({ label: 'broken', undo: async () => { throw new Error('gone') }, redo: async () => {} })
  await assert.rejects(history.undo())
  assert.equal((await history.undo())?.label, 'old')
})

test('the history keeps a limited number of steps', async () => {
  const history = new UndoHistory(2)
  for (const name of ['a', 'b', 'c']) history.record(counter([], name))
  assert.equal((await history.undo())?.label, 'c')
  assert.equal((await history.undo())?.label, 'b')
  assert.equal(await history.undo(), null)
})
