import { test } from 'node:test'
import assert from 'node:assert/strict'
import { soilVisibility } from '../../../app/frontend/map/soil/visibility.ts'

test('soil points and bio-indicators follow the « existing » layer', () => {
  assert.deepEqual(soilVisibility({ showOnMap: true, suggesting: false, hiddenLayers: [] }), { samples: true, bioindicators: true, suggestions: true })
  assert.deepEqual(soilVisibility({ showOnMap: true, suggesting: false, hiddenLayers: ['existing', 'plants'] }), { samples: false, bioindicators: false, suggestions: true })
})

test('only « Réseaux » shown: no bio-indicators on the map', () => {
  const hidden = ['existing', 'water', 'access', 'structures', 'plants', 'animals', 'notes']
  assert.equal(soilVisibility({ showOnMap: true, suggesting: false, hiddenLayers: hidden }).bioindicators, false)
})

test('« Calques » hides bio-indicators and sampling points one by one', () => {
  assert.deepEqual(soilVisibility({ showOnMap: true, suggesting: false, hiddenLayers: [], hiddenSoil: ['bioindicators'] }), { samples: true, bioindicators: false, suggestions: true })
  assert.deepEqual(soilVisibility({ showOnMap: true, suggesting: false, hiddenLayers: [], hiddenSoil: ['samples'] }), { samples: false, bioindicators: true, suggestions: true })
})

test('the module switch still hides everything', () => {
  assert.deepEqual(soilVisibility({ showOnMap: false, suggesting: false, hiddenLayers: [] }), { samples: false, bioindicators: false, suggestions: false })
})

test('suggested positions stay while suggesting, whatever the layers', () => {
  assert.deepEqual(soilVisibility({ showOnMap: false, suggesting: true, hiddenLayers: ['existing'] }), { samples: false, bioindicators: false, suggestions: true })
})
