import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deleteTargets, isDeleteShortcut } from '../../../app/frontend/map/drawing/deleteShortcut.ts'

const key = (key: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra })

const plant = (id: number, plantedOn?: string) => ({ properties: { id, layer: 'plants', kind: 'plant', ...(plantedOn ? { planted_on: plantedOn } : {}) } })
const swale = (id: number, planned: boolean) => ({ properties: { id, layer: 'water', kind: 'half_moon', ...(planned ? { planned: true } : {}) } })
const draft = (id: number) => ({ properties: { id, layer: 'water', kind: 'pond', planned: true, status: 'draft' } })
const features = [plant(1), plant(2), plant(3, '2024-11-20'), swale(4, true), swale(5, true), swale(6, false), draft(7)]
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
  assert.deepEqual(deleteTargets({ ...none, peekedId: 1 }, features), { planned: [1], kept: 0, plantsOnly: true })
  assert.deepEqual(deleteTargets({ ...none, selectedId: 2 }, features), { planned: [2], kept: 0, plantsOnly: true })
})

test('a plant in the ground is never offered', () => {
  assert.deepEqual(deleteTargets({ ...none, peekedId: 3 }, features), { planned: [], kept: 1, plantsOnly: true })
})

test('a planned element, alone or several, is offered; one on the ground is not', () => {
  assert.deepEqual(deleteTargets({ ...none, selectedId: 4 }, features), { planned: [4], kept: 0, plantsOnly: false })
  assert.deepEqual(deleteTargets({ ...none, selection: [4, 5, 6] }, features), { planned: [4, 5], kept: 1, plantsOnly: false })
  assert.deepEqual(deleteTargets({ ...none, selectedId: 6 }, features), { planned: [], kept: 1, plantsOnly: false })
})

test('a mixed selection keeps only what is planned and counts the rest', () => {
  assert.deepEqual(deleteTargets({ ...none, selection: [1, 2, 3, 4, 6] }, features), { planned: [1, 2, 4], kept: 2, plantsOnly: false })
})

test('AI drafts are left out; nothing picked: the key does nothing', () => {
  assert.equal(deleteTargets(none, features), null)
  assert.equal(deleteTargets({ ...none, selectedId: 7 }, features), null)
  assert.equal(deleteTargets({ ...none, selection: [7, 9] }, features), null)
})
