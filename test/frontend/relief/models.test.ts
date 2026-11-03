import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildingLayer, drawnBuildings, mergeBuildings, modelBuildings, type BuildingData } from '../../../app/frontend/relief/buildings.ts'
import { fromMercator, toGrid, type GridMeta } from '../../../app/frontend/relief/grid.ts'
import { modelHeight, modelPlanes, modelShell, roofKind, type ModelData } from '../../../app/frontend/relief/models.ts'

// A 20 × 20 grid of 1 m cells (at the equator a Mercator metre is a metre).
const meta: GridMeta = { west: 0, north: 20, step: 1, cols: 20, rows: 20, cellSizeM: 1 }
const lngLat = (x: number, y: number) => fromMercator(x, 20 - y) as [number, number]
const at = (x: number, y: number, h: number) => [...lngLat(x, y), h] as [number, number, number]

// A house of 6 m × 4 m (x 5→11, y 5→9), gable roof: gutters at 5 m, ridge
// at 8 m along y = 7.
function house(): ModelData {
  return {
    id: 'urbis-1', height: 8,
    rings: [[[5, 5], [11, 5], [11, 9], [5, 9], [5, 5]].map(([x, y]) => lngLat(x, y))],
    roofs: [
      [[at(5, 5, 5), at(11, 5, 5), at(11, 7, 8), at(5, 7, 8), at(5, 5, 5)]],
      [[at(5, 7, 8), at(11, 7, 8), at(11, 9, 5), at(5, 9, 5), at(5, 7, 8)]],
    ],
  }
}

test('a model roof: its surfaces, a wall under every free edge, none under the ridge', () => {
  const shell = modelShell(house().roofs, [], (p) => toGrid(meta, p))
  assert.equal(shell.polygons?.length, 2)
  // 4 + 4 edges, the ridge shared by both: 6 walls.
  assert.equal(shell.edges?.length, 6)
  assert.ok(shell.edges?.every(([a, b]) => !(Math.abs(a.h - 8) < 1e-9 && Math.abs(b.h - 8) < 1e-9)), 'no wall under the ridge')
  assert.equal(roofKind(shell), 'pitched')

  const planes = modelPlanes(shell)
  assert.ok(Math.abs((modelHeight(planes, { x: 8, y: 7 }) ?? 0) - 8) < 1e-6)
  assert.ok(Math.abs((modelHeight(planes, { x: 8, y: 6 }) ?? 0) - 6.5) < 1e-6)
  assert.equal(modelHeight(planes, { x: 15, y: 15 }), null)
})

test('a flat roof with a light well, and a single slope', () => {
  const flat = modelShell([[
    [at(2, 2, 3), at(8, 2, 3), at(8, 8, 3), at(2, 8, 3), at(2, 2, 3)],
    [at(4, 4, 3), at(4, 6, 3), at(6, 6, 3), at(6, 4, 3), at(4, 4, 3)],
  ]], [], (p) => toGrid(meta, p))
  assert.equal(roofKind(flat), 'flat')
  assert.equal(flat.edges?.length, 8, 'walls around the light well too')
  assert.equal(modelHeight(modelPlanes(flat), { x: 5, y: 5 }), null, 'the light well is open')
  assert.ok(Math.abs((modelHeight(modelPlanes(flat), { x: 3, y: 3 }) ?? 0) - 3) < 1e-6)

  const shed = modelShell([[[at(2, 2, 3), at(8, 2, 3), at(8, 8, 5), at(2, 8, 5), at(2, 2, 3)]]], [], (p) => toGrid(meta, p))
  assert.equal(roofKind(shed), 'shed')
})

test('the volume of a model building: its measured roof over every cell', () => {
  const ground = new Float32Array(400).fill(100)
  const layer = buildingLayer(meta, modelBuildings([house()]), { original: ground, ground, surface: null })
  const [volume] = layer.volumes
  assert.equal(volume.source, 'model')
  assert.equal(volume.model, 'pitched')
  assert.equal(volume.height, 8)
  assert.equal(volume.eaves, 5)
  // Cell (8, 7) under the ridge, (8, 6) halfway down the slope.
  assert.ok(Math.abs(layer.tops[7 * 20 + 8] - 8) < 1e-5)
  assert.ok(Math.abs(layer.tops[6 * 20 + 8] - 6.5) < 1e-5)
  assert.ok(Math.abs(layer.roofs[6 * 20 + 8] - 106.5) < 1e-4)
})

test('the model replaces the footprints; a drawn building gives way unless it has its own roof', () => {
  const osm: BuildingData = { id: 'w1', kind: 'house', rings: house().rings, height: null, minHeight: null, levels: null }
  const models = modelBuildings([house()])
  assert.deepEqual(mergeBuildings([osm], [], models).map((b) => b.id), ['urbis-1'])

  const feature = (properties: Record<string, unknown>) => ({ geometry: { type: 'Polygon', coordinates: house().rings }, properties: { id: 42, kind: 'building', status: 'active', ...properties } })
  const plain = mergeBuildings([osm], drawnBuildings([feature({ height_m: 7 })]), models)
  assert.deepEqual(plain.map((b) => b.id), ['urbis-1'])
  assert.equal(plain[0].drawnId, 42, 'the model keeps the drawn building, to set its roof')
  assert.equal(models[0].drawnId, undefined, 'the model data is left as it came')

  assert.deepEqual(mergeBuildings([osm], drawnBuildings([feature({ height_m: 7, roof: 'hip' })]), models).map((b) => b.id), ['drawn-42'])
  assert.deepEqual(mergeBuildings([osm], drawnBuildings([feature({ height_m: 7, planned: true })]), models).map((b) => b.id), ['drawn-42'])
})
