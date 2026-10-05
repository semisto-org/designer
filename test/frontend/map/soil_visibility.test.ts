import { test } from 'node:test'
import assert from 'node:assert/strict'
import { soilVisibility } from '../../../app/frontend/map/soil/visibility.ts'

test('soil points and bio-indicators follow the « existing » layer', () => {
  assert.deepEqual(soilVisibility({ showOnMap: true, suggesting: false, hiddenLayers: [] }), { points: true, suggestions: true })
  assert.deepEqual(soilVisibility({ showOnMap: true, suggesting: false, hiddenLayers: ['existing', 'plants'] }), { points: false, suggestions: true })
})

test('only « Réseaux » shown: no bio-indicators on the map', () => {
  const hidden = ['existing', 'water', 'access', 'structures', 'plants', 'animals', 'notes']
  assert.equal(soilVisibility({ showOnMap: true, suggesting: false, hiddenLayers: hidden }).points, false)
})

test('the module switch still hides everything', () => {
  assert.deepEqual(soilVisibility({ showOnMap: false, suggesting: false, hiddenLayers: [] }), { points: false, suggestions: false })
})

test('suggested positions stay while suggesting, whatever the layers', () => {
  assert.deepEqual(soilVisibility({ showOnMap: false, suggesting: true, hiddenLayers: ['existing'] }), { points: false, suggestions: true })
})
