import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPlants, parsePlanted, plantedInput, type PlantLine } from '../../../app/frontend/palette/plants.ts'

const line = (over: Partial<PlantLine>): PlantLine => ({
  id: 1, number: 1, name: null, key: '1-', species: 'Pommier', plantedOn: null, plantedPrecision: null, tags: [], lockVersion: 0, ...over,
})

test('a typed planting date: a year, a day, or nothing for « date inconnue »', () => {
  const today = '2026-10-18'
  assert.deepEqual(parsePlanted('2015', today), { planted_on: '2015-01-01', planted_on_precision: 'year' })
  assert.deepEqual(parsePlanted('12/3/2024', today), { planted_on: '2024-03-12', planted_on_precision: null })
  assert.deepEqual(parsePlanted('2024-03-12', today), { planted_on: '2024-03-12', planted_on_precision: null })
  assert.deepEqual(parsePlanted('  ', today), { planted_on: today, planted_on_precision: 'unknown' })
  assert.equal(parsePlanted('31/02/2024', today), undefined)
  assert.equal(parsePlanted('2030', today), undefined)
  assert.equal(parsePlanted('hier', today), undefined)
})

test('the field shows back what was typed', () => {
  assert.equal(plantedInput({ plantedOn: '2015-01-01', plantedPrecision: 'year' }), '2015')
  assert.equal(plantedInput({ plantedOn: '2024-03-12', plantedPrecision: null }), '12/03/2024')
  assert.equal(plantedInput({ plantedOn: '2026-10-18', plantedPrecision: 'unknown' }), '')
})

test('filters by number, words, status and tag', () => {
  const plants = [
    line({ id: 1, number: 12, species: 'Pommier', plantedOn: '2015-01-01', tags: ['Verger'] }),
    line({ id: 2, number: 2, species: 'Aulne glutineux' }),
    line({ id: 3, number: 120, species: 'Néflier' }),
  ]
  const ids = (search: string, status: '' | 'planned' | 'planted' = '', tag = '') => filterPlants(plants, { search, status, tag }).map((p) => p.id)
  assert.deepEqual(ids('12'), [1])
  assert.deepEqual(ids('neflier'), [3])
  assert.deepEqual(ids('', 'planned'), [2, 3])
  assert.deepEqual(ids('', 'planted'), [1])
  assert.deepEqual(ids('', '', 'verger'), [1])
})
