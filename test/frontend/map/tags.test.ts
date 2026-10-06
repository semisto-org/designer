import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addTag, groupByTag, hasTag, normalizeTag, removeTag, tagCounts, UNTAGGED } from '../../../app/frontend/map/tags/tags.ts'

const f = (id: number, tags?: unknown) => ({ id, properties: { tags } })

test('tags are trimmed, single-spaced, and never added twice whatever the case', () => {
  assert.equal(normalizeTag('  Zone   nord '), 'Zone nord')
  assert.deepEqual(addTag(['Phase 1'], ' phase  1 '), ['Phase 1'])
  assert.deepEqual(addTag(['Phase 1'], 'Haie'), ['Phase 1', 'Haie'])
  assert.deepEqual(addTag([], '   '), [])
  assert.deepEqual(addTag([], 'x'.repeat(41)), [])
  assert.deepEqual(removeTag(['Phase 1', 'Haie'], 'PHASE 1'), ['Haie'])
})

test('a tag matches whatever the case; UNTAGGED matches elements without tags', () => {
  assert.equal(hasTag(f(1, ['Phase 1']), 'phase 1'), true)
  assert.equal(hasTag(f(1, ['Phase 1']), 'Haie'), false)
  assert.equal(hasTag(f(1, []), UNTAGGED), true)
  assert.equal(hasTag(f(1, undefined), UNTAGGED), true)
  assert.equal(hasTag(f(1, ['Haie']), UNTAGGED), false)
})

test('tag counts keep the first spelling and sort the French way', () => {
  const items = [f(1, ['zone nord', 'Phase 10']), f(2, ['Zone Nord', 'Phase 2']), f(3, ['érable'])]
  assert.deepEqual(tagCounts(items), [
    { tag: 'érable', count: 1 }, { tag: 'Phase 2', count: 1 }, { tag: 'Phase 10', count: 1 }, { tag: 'zone nord', count: 2 },
  ])
})

test('grouping puts an element under each of its tags, then the untagged', () => {
  const a = f(1, ['Haie', 'Phase 1'])
  const b = f(2, ['phase 1'])
  const c = f(3, [])
  assert.deepEqual(groupByTag([a, b, c]).map((g) => [g.tag, g.items.map((i) => i.id)]), [
    ['Haie', [1]], ['Phase 1', [1, 2]], [null, [3]],
  ])
})
