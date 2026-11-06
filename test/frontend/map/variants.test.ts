import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inVariant, ownCounts, retainedVariant, shownVariant, variantFilter, variantOf } from '../../../app/frontend/map/variants/variants.ts'

const v1 = { id: 1, name: 'Projet 1', notes: null, position: 0, retained: true }
const v2 = { id: 2, name: 'Projet 2', notes: null, position: 1, retained: false }

test('the variant shown is the one chosen while it exists, else the retained one', () => {
  assert.equal(shownVariant([v1, v2], 2)?.id, 2)
  assert.equal(shownVariant([v1, v2], 9)?.id, 1)
  assert.equal(shownVariant([v1, v2], null)?.id, 1)
  assert.equal(shownVariant([], 2), null)
  assert.equal(retainedVariant([{ ...v1, retained: false }, v2])?.id, 1)
})

test('a variant shows the common project and its own elements', () => {
  const common = { variant_id: null }
  const own = { variant_id: 2 }
  const other = { variant_id: 1 }
  assert.deepEqual([common, own, other].map((p) => inVariant(p, 2)), [true, true, false])
  assert.deepEqual([common, own, other].map((p) => inVariant(p, null)), [true, true, true])
  assert.equal(variantOf({}), null)
  assert.equal(variantOf({ variant_id: 3 }), 3)
})

test('the map filter keeps the same elements', () => {
  assert.equal(variantFilter(null), null)
  assert.deepEqual(variantFilter(2), ['in', ['coalesce', ['get', 'variant_id'], 0], ['literal', [0, 2]]])
})

test('own elements are counted per variant, rejected drafts left out', () => {
  const counts = ownCounts([
    { properties: { variant_id: 1, status: 'active' } },
    { properties: { variant_id: 1, status: 'draft' } },
    { properties: { variant_id: 1, status: 'rejected' } },
    { properties: { variant_id: 2, status: 'active' } },
    { properties: { variant_id: null, status: 'active' } },
  ])
  assert.deepEqual([...counts], [[1, 2], [2, 1]])
})
