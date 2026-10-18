import { test } from 'node:test'
import assert from 'node:assert/strict'
import { otherProperties, propertyLabel } from '../../../app/frontend/map/plants/otherProperties.ts'

test('keeps only what no section shows, labelled and sorted', () => {
  const list = otherProperties({
    id: 4, species_id: 12, planted_on: '2026-01-01', number: 7, name: 'Pommier',
    sante: 'inquiétant', production_2025: 'faible', greffe: true, vide: '', rien: null, couleurs: ['rouge', 'jaune'],
  })
  assert.deepEqual(list, [
    { key: 'couleurs', label: 'Couleurs', value: 'rouge, jaune' },
    { key: 'greffe', label: 'Greffe', value: 'oui' },
    { key: 'production_2025', label: 'Production 2025', value: 'faible' },
    { key: 'sante', label: 'Sante', value: 'inquiétant' },
  ])
})

test('labels a key in words', () => {
  assert.equal(propertyLabel('etat-sanitaire_2026'), 'Etat sanitaire 2026')
})
