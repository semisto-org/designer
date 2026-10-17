import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byHardiness, hardinessHere, matchesPalette } from '../../../app/frontend/map/plants/paletteSearch.ts'

const item = (name: string, latinName: string, commonName: string | null = null) =>
  ({ name, latinName, species: { commonName, latinName: latinName.split(' ').slice(0, 2).join(' ') } })

test('finds a palette item by any of its names, accents and case aside', () => {
  const reinette = item("Pommier 'Reinette étoilée'", "Malus domestica 'Reinette étoilée'", 'Pommier')
  assert.ok(matchesPalette(reinette, 'pommier'))
  assert.ok(matchesPalette(reinette, 'ETOILEE'))
  assert.ok(matchesPalette(reinette, 'malus reinette'))
  assert.ok(matchesPalette(reinette, '  '))
  assert.ok(!matchesPalette(reinette, 'poirier'))
  assert.ok(!matchesPalette(reinette, 'pommier poirier'))
})

test('matches the species common name when the item carries a variety name', () => {
  assert.ok(matchesPalette(item("'Géant de Breda'", "Mespilus germanica 'Géant de Breda'", 'Néflier'), 'neflier'))
})

test('says whether a species survives the winter of the terrain', () => {
  assert.equal(hardinessHere(5, 8), 'fits')
  assert.equal(hardinessHere(8, 8), 'fits')
  assert.equal(hardinessHere(9, 8), 'misfit')
  assert.equal(hardinessHere(null, 8), 'unknown')
  assert.equal(hardinessHere(5, null), 'unknown')
})

test('puts hardy species first, unknown next, too tender last, keeping the order otherwise', () => {
  const species = [
    { id: 1, hardinessZone: 10 }, { id: 2, hardinessZone: null }, { id: 3, hardinessZone: 4 },
    { id: 4, hardinessZone: 9 }, { id: 5, hardinessZone: 7 },
  ]
  assert.deepEqual(byHardiness(species, 8).map((s) => s.id), [3, 5, 2, 1, 4])
  assert.deepEqual(byHardiness(species, null).map((s) => s.id), [1, 2, 3, 4, 5])
})
