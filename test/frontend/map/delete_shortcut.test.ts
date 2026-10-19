import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deleteTargets, isDeleteShortcut } from '../../../app/frontend/map/drawing/deleteShortcut.ts'

const key = (key: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra })

const plant = (id: number, plantedOn?: string) => ({ properties: { id, layer: 'plants', kind: 'plant', ...(plantedOn ? { planted_on: plantedOn } : {}) } })
const pond = (id: number) => ({ properties: { id, layer: 'water', kind: 'pond', planned: true } })
const features = [plant(1), plant(2), plant(3, '2024-11-20'), pond(4)]
const none = { peekedId: null, selectedId: null, selection: [] }

test('Backspace or Delete alone offers the deletion', () => {
  assert.equal(isDeleteShortcut(key('Backspace')), true)
  assert.equal(isDeleteShortcut(key('Delete')), true)
})

test('with a modifier, or another key, it does not', () => {
  assert.equal(isDeleteShortcut(key('Backspace', { metaKey: true })), false)
  assert.equal(isDeleteShortcut(key('Backspace', { altKey: true })), false)
  assert.equal(isDeleteShortcut(key('Delete', { shiftKey: true })), false)
  assert.equal(isDeleteShortcut(key('x')), false)
})

test('a planned plant, from its card or the inspector', () => {
  assert.deepEqual(deleteTargets({ ...none, peekedId: 1 }, features), { planned: [1], planted: 0 })
  assert.deepEqual(deleteTargets({ ...none, selectedId: 2 }, features), { planned: [2], planted: 0 })
})

test('a plant in the ground is never offered', () => {
  assert.deepEqual(deleteTargets({ ...none, peekedId: 3 }, features), { planned: [], planted: 1 })
})

test('a selection keeps only its planned plants and counts the others', () => {
  assert.deepEqual(deleteTargets({ ...none, selection: [1, 2, 3, 4] }, features), { planned: [1, 2], planted: 1 })
})

test('nothing picked, or no plant in it: the key does nothing', () => {
  assert.equal(deleteTargets(none, features), null)
  assert.equal(deleteTargets({ ...none, selectedId: 4 }, features), null)
  assert.equal(deleteTargets({ ...none, selection: [4, 9] }, features), null)
})
