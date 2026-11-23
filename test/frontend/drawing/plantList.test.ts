import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Polygon } from 'geojson'
import { insideRing, plantListRows, speciesCount } from '../../../app/frontend/map/drawing/plantList.ts'

const frame: Polygon = { type: 'Polygon', coordinates: [[[4, 50], [4.01, 50], [4.01, 50.01], [4, 50.01], [4, 50]]] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plant = (id: number, at: [number, number], props: Record<string, unknown>): any => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: at },
  properties: { id, layer: 'plants', kind: 'plant', status: 'active', ...props },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = {
  species: {
    1: { id: 1, latinName: 'Prunus domestica', commonName: 'Prunier', strata: 'sub_canopy' },
    2: { id: 2, latinName: 'Ribes rubrum', commonName: null, strata: 'shrub' },
  },
  varieties: { 10: { id: 10, speciesId: 1, name: 'Reine-claude dorée', latinName: "Prunus domestica 'Reine-claude dorée'", commonName: null } },
  palette: [],
}

test('a point inside the frame is in, one outside is out', () => {
  assert.equal(insideRing([4.005, 50.005], frame.coordinates[0]), true)
  assert.equal(insideRing([4.02, 50.005], frame.coordinates[0]), false)
})

test('the list holds the numbered plants of the frame the map draws, by number', () => {
  const features = [
    plant(1, [4.002, 50.002], { number: 127, species_id: 1, variety_id: 10, planted_on: '2024-11-20' }),
    plant(2, [4.003, 50.003], { number: '12', species_id: 2 }),
    plant(3, [4.004, 50.004], { number: 3, species_id: 1, name: 'Le prunier de Julie' }),
    plant(4, [4.02, 50.004], { number: 4, species_id: 1 }), // outside the frame
    plant(5, [4.005, 50.005], { species_id: 1 }), // no number
    plant(6, [4.006, 50.006], { number: 6, species_id: 2 }), // hidden on the map
    { ...plant(7, [4.007, 50.007], { number: 7 }), properties: { id: 7, layer: 'structures', kind: 'shed', number: 7 } },
  ]
  const rows = plantListRows(features, data, frame, (f) => f.properties.id !== 6, (f) => (f.properties.species_id === 2 ? 'shrub' : 'sub_canopy'))
  assert.deepEqual(rows.map((r) => r.number), [3, 12, 127])
  assert.deepEqual(rows[0], {
    featureId: 3, number: 3, speciesId: 1, name: 'Le prunier de Julie', variety: null, latinName: 'Prunus domestica',
    strata: 'sub_canopy', planted: false, plantedYear: null,
  })
  // A species without a common name goes by its latin name.
  assert.equal(rows[1].name, 'Ribes rubrum')
  assert.deepEqual([rows[2].variety, rows[2].planted, rows[2].plantedYear], ['Reine-claude dorée', true, 2024])
  assert.equal(speciesCount(rows), 2)
})
