import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plantCode, plantLabelRank, plantLabelText, plantLabelZoom } from '../../../app/frontend/map/plants/labelRank.ts'

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

test('the latin code takes two letters of the genus and of the species', () => {
  assert.equal(plantCode('Malus domestica'), 'Ma do')
  assert.equal(plantCode('Malus domestica \'Reinette\''), 'Ma do')
  assert.equal(plantCode('Tilia × europaea'), 'Ti eu')
  assert.equal(plantCode('Ribes x nidigrolaria'), 'Ri ni')
  assert.equal(plantCode('Rubus'), 'Ru')
  assert.equal(plantCode(''), null)
})

test('a plant label writes its number before its name, once', () => {
  const pommier = { number: 12, speciesName: 'Pommier', latinName: 'Malus domestica' }
  assert.equal(plantLabelText(pommier, 'name'), '12 · Pommier')
  assert.equal(plantLabelText(pommier, 'code'), '12 · Ma do')
  assert.equal(plantLabelText({ ...pommier, varietyName: 'Reinette' }, 'name'), "12 · Pommier 'Reinette'")
  assert.equal(plantLabelText({ number: 27, ownName: '27 · Toona sinensis' }, 'name'), '27 · Toona sinensis')
  assert.equal(plantLabelText({ number: 93, ownName: '93 ? · à identifier' }, 'name'), '93 · à identifier')
  assert.equal(plantLabelText({ number: 5 }, 'code'), '5')
})
