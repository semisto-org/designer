import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plantLabelRank, plantLabelZoom } from '../../../app/frontend/map/plants/labelRank.ts'

test('big trees are named from further out than shrubs and small plants', () => {
  assert.equal(plantLabelZoom(12), 17)
  assert.equal(plantLabelZoom(4), 18)
  assert.equal(plantLabelZoom(0.5), 19)
})

test('a plant without a known crown is named last', () => {
  assert.equal(plantLabelZoom(null), 19)
  assert.equal(plantLabelZoom(undefined), 19)
  assert.equal(plantLabelZoom(Number.NaN), 19)
  assert.equal(plantLabelRank(null), 0)
})

test('the bigger crown wins a collision', () => {
  assert.ok(plantLabelRank(12) < plantLabelRank(1.5))
  assert.ok(plantLabelRank(1.5) < plantLabelRank(null))
})
