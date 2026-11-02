import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseExpanded, railItems } from '../../../app/frontend/map/editor/railItems.ts'

const items = [
  { id: 'layers', essential: true },
  { id: 'relief', essential: true },
  { id: 'climate' },
  { id: 'soil' },
]
const ids = (list: { id: string }[]) => list.map((i) => i.id)

test('a step shows its essential tools and counts the others', () => {
  const result = railItems(items, { expanded: false, pinned: [] })
  assert.deepEqual(ids(result.shown), ['layers', 'relief'])
  assert.equal(result.hidden, 2)
})

test('a step the person unfolded shows everything', () => {
  assert.equal(railItems(items, { expanded: true, pinned: [] }).hidden, 0)
})

test('the open panel and the one to do now never hide, in their order', () => {
  const result = railItems(items, { expanded: false, pinned: ['soil', null] })
  assert.deepEqual(ids(result.shown), ['layers', 'relief', 'soil'])
  assert.equal(result.hidden, 1)
})

test('a step without essential tools is never empty', () => {
  const result = railItems([{ id: 'a' }, { id: 'b' }], { expanded: false, pinned: [] })
  assert.equal(result.shown.length, 2)
  assert.equal(result.hidden, 0)
})

test('the unfolded steps survive a broken or foreign value', () => {
  assert.deepEqual(parseExpanded('["observe","plant"]'), ['observe', 'plant'])
  assert.deepEqual(parseExpanded('{"a":1}'), [])
  assert.deepEqual(parseExpanded('not json'), [])
  assert.deepEqual(parseExpanded(null), [])
})
