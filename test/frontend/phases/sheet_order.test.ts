import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applySheetLayers, sheetIds } from '../../../app/frontend/map/phases/layers.ts'

/** Just enough of a MapLibre map: layers in order, sources, and a count of moves (each one a style change). */
function fakeMap() {
  const layers: string[] = ['base', 'features-fill']
  const sources = new Map<string, { setData: () => void }>()
  let moves = 0
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => { sources.set(id, { setData: () => {} }) },
    removeSource: (id: string) => { sources.delete(id) },
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: ({ id }: { id: string }) => { layers.push(id) },
    removeLayer: (id: string) => { layers.splice(layers.indexOf(id), 1) },
    moveLayer: (id: string) => { moves++; layers.splice(layers.indexOf(id), 1); layers.push(id) },
    getLayersOrder: () => [...layers],
    setPaintProperty: () => {},
  }
  return { map: map as never, layers, moves: () => moves }
}

const empty = { type: 'FeatureCollection' as const, features: [] }

test('a phase and a teammate sketch shown together settle in one order instead of taking the top from each other', () => {
  const { map, layers, moves } = fakeMap()
  const phase = sheetIds('design-phase')
  const compare = sheetIds('variant-compare')
  applySheetLayers(map, compare, empty, 0)
  applySheetLayers(map, phase, empty, 0)
  // Each overlay answers every style event: a few rounds must leave the map still.
  for (let round = 0; round < 3; round++) {
    applySheetLayers(map, phase, empty, 0)
    applySheetLayers(map, compare, empty, 0)
  }
  const settled = moves()
  applySheetLayers(map, phase, empty, 0)
  applySheetLayers(map, compare, empty, 0)
  assert.equal(moves(), settled)
  assert.deepEqual(layers.slice(-8), [...phase.layers, ...compare.layers])
})

test('a layer added above the sheets is passed again, once', () => {
  const { map, layers, moves } = fakeMap()
  const phase = sheetIds('design-phase')
  applySheetLayers(map, phase, empty, 0)
  layers.push('labels')
  applySheetLayers(map, phase, empty, 0)
  const after = moves()
  applySheetLayers(map, phase, empty, 0)
  assert.equal(moves(), after)
  assert.deepEqual(layers.slice(-4), phase.layers)
})
