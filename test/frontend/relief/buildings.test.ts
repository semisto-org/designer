import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildingLayer, drawnBuildings, mergeBuildings, taggedHeight, type BuildingData } from '../../../app/frontend/relief/buildings.ts'
import { fromMercator, type GridMeta } from '../../../app/frontend/relief/grid.ts'

// A 20 × 20 grid of 1 m cells (at the equator a Mercator metre is a metre).
const meta: GridMeta = { west: 0, north: 20, step: 1, cols: 20, rows: 20, cellSizeM: 1 }
const lngLat = (x: number, y: number) => fromMercator(x, 20 - y) as [number, number]

function building(overrides: Partial<BuildingData> = {}): BuildingData {
  // A 6 m × 4 m footprint, x 5→11, y 5→9.
  const ring = [[5, 5], [11, 5], [11, 9], [5, 9], [5, 5]].map(([x, y]) => lngLat(x, y))
  return { id: 'w1', kind: 'house', rings: [ring], height: null, minHeight: null, levels: null, ...overrides }
}

test('tagged heights: height, then levels, then the kind of building', () => {
  assert.deepEqual(taggedHeight(building({ height: 12 })), { height: 12, source: 'tags' })
  assert.deepEqual(taggedHeight(building({ levels: 2 })), { height: 7.5, source: 'tags' })
  assert.equal(taggedHeight(building({ kind: 'shed' })).height, 3)
  assert.equal(taggedHeight(building()).source, 'guess')
})

test('the height is measured on the surface model, and the base is the lowest ground under it', () => {
  const ground = new Float32Array(400).map((_, i) => 100 + (i % 20) * 0.1)
  const surface = Float32Array.from(ground)
  for (let r = 5; r <= 9; r++) for (let c = 5; c <= 11; c++) surface[r * 20 + c] += 8.4
  const layer = buildingLayer(meta, [building({ levels: 1 })], { original: ground, ground, surface })
  const [volume] = layer.volumes
  assert.equal(volume.source, 'surface')
  assert.equal(volume.roof.type, 'flat', 'a 6 % tilt of the ground is no roof slope')
  // Measured from the lowest ground under it: 8.4 m + half the tilt.
  assert.ok(Math.abs(volume.height - 8.7) < 0.05, String(volume.height))
  assert.ok(Math.abs(volume.base - 100.5) < 1e-3)
  assert.equal(layer.covered[7 * 20 + 8], 1, 'inside')
  assert.equal(layer.covered[4 * 20 + 8], 1, 'one cell around')
  assert.equal(layer.covered[2 * 20 + 8], 0, 'further away')
  assert.ok(layer.roofs[7 * 20 + 8] > 108)
})

test('a surface model that does not see the building keeps the tags', () => {
  const ground = new Float32Array(400).fill(50)
  const layer = buildingLayer(meta, [building({ levels: 2 })], { original: ground, ground, surface: ground })
  assert.equal(layer.volumes[0].source, 'tags')
  assert.equal(layer.volumes[0].height, 7.5)
})

test('buildings off the grid are left out', () => {
  const far = [[50, 50], [55, 50], [55, 55], [50, 55], [50, 50]].map(([x, y]) => lngLat(x, y))
  const ground = new Float32Array(400).fill(50)
  const layer = buildingLayer(meta, [building({ rings: [far] })], { original: ground, ground, surface: null })
  assert.equal(layer.volumes.length, 0)
})

test('drawn buildings: active ones of a building kind, at the height of their card, planned or not', () => {
  const ring = building().rings[0]
  const drawn = drawnBuildings([
    { geometry: { type: 'Polygon', coordinates: [ring] }, properties: { id: 7, kind: 'building', status: 'active', height_m: 9, planned: true } },
    { geometry: { type: 'Polygon', coordinates: [ring] }, properties: { id: 8, kind: 'greenhouse', status: 'active' } },
    { geometry: { type: 'Polygon', coordinates: [ring] }, properties: { id: 9, kind: 'pond', status: 'active' } },
    { geometry: { type: 'Polygon', coordinates: [ring] }, properties: { id: 10, kind: 'shed', status: 'draft' } },
  ])
  assert.deepEqual(drawn.map((b) => [b.id, b.kind, b.height, b.planned]), [['drawn-7', 'building', 9, true], ['drawn-8', 'greenhouse', null, false]])
  assert.equal(taggedHeight(drawn[1]).height, 3)
})

test('a drawn building replaces the OpenStreetMap footprint it covers, and keeps its own height whatever the surface model says', () => {
  const ring = building().rings[0]
  const far = [[14, 14], [18, 14], [18, 18], [14, 18], [14, 14]].map(([x, y]) => lngLat(x, y))
  const [drawn] = drawnBuildings([{ geometry: { type: 'Polygon', coordinates: [ring] }, properties: { id: 1, kind: 'building', height_m: 5, planned: true } }])
  const merged = mergeBuildings([building({ id: 'osm-same' }), building({ id: 'osm-far', rings: [far] })], [drawn])
  assert.deepEqual(merged.map((b) => b.id), ['osm-far', 'drawn-1'])

  const ground = new Float32Array(400).fill(50)
  const surface = Float32Array.from(ground)
  for (let r = 5; r <= 9; r++) for (let c = 5; c <= 11; c++) surface[r * 20 + c] += 12
  const layer = buildingLayer(meta, [drawn], { original: ground, ground, surface })
  assert.equal(layer.volumes[0].height, 5)
  assert.equal(layer.volumes[0].planned, true)
  assert.equal(layer.volumes[0].source, 'tags')
  assert.ok(layer.roofs[7 * 20 + 8] >= 55, 'its roof is there for the shadows')
})
