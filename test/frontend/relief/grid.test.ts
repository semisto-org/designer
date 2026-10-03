import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageCorners, polygonMask, toGrid, toLngLat, toMercator, type GridMeta } from '../../../app/frontend/relief/grid.ts'
import { ramp, HYPSOMETRY, waterColor } from '../../../app/frontend/relief/colors.ts'
import { buildSoilMaps, roofRainwater } from '../../../app/frontend/relief/soil.ts'

function metaAround(lng: number, lat: number, cols: number, rows: number, cell = 1): GridMeta {
  const [x, y] = toMercator(lng, lat)
  const step = cell / Math.cos((lat * Math.PI) / 180)
  return { west: x, north: y, step, cols, rows, cellSizeM: cell }
}

test('grid ↔ lng/lat round trip in ground metres', () => {
  const meta = metaAround(4.9, 50.34, 100, 100)
  const p = toGrid(meta, [4.9005, 50.3397])
  assert.ok(Math.abs(p.x - 35.6) < 0.5, `x ${p.x}`)
  assert.ok(Math.abs(p.y - 33.4) < 0.5, `y ${p.y}`)
  const [lng, lat] = toLngLat(meta, p)
  assert.ok(Math.abs(lng - 4.9005) < 1e-6 && Math.abs(lat - 50.3397) < 1e-6)
})

test('image corners frame the cells', () => {
  const meta = metaAround(4.9, 50.34, 11, 11)
  const [tl, , br] = imageCorners(meta)
  assert.ok(tl[0] < 4.9 && tl[1] > 50.34)
  assert.ok(br[0] > 4.9 && br[1] < 50.34)
})

test('polygon mask, also on a coarser block grid', () => {
  const meta = metaAround(4.9, 50.34, 100, 100)
  const corner = (x: number, y: number) => toLngLat(meta, { x, y })
  const square = { type: 'Polygon' as const, coordinates: [[corner(20, 20), corner(60, 20), corner(60, 50), corner(20, 50), corner(20, 20)]] }
  const fine = polygonMask(meta, square)
  const inside = fine.reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(inside - 41 * 30) < 50, `inside ${inside}`)
  const coarse = polygonMask(meta, square, 4)
  assert.equal(coarse.length, 25 * 25)
  const coarseInside = coarse.reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(coarseInside * 16 - inside) < 200, `coarse ${coarseInside}`)
  assert.ok(polygonMask(meta, null).every((v) => v === 1))
})

test('soil maps average land cover classes and apply the soil factor', () => {
  const landcover = new Uint8Array([7, 9, 7, 9])
  const classes = { 7: { label: 'Prairie', rate: 15, storage: 50, color: '#000' }, 9: { label: 'Feuillus', rate: 50, storage: 80, color: '#000' } }
  const { rate, storage } = buildSoilMaps(2, 2, 2, landcover, classes, { uniformRate: 10, storage: 50, rateFactor: 0.5, storageFactor: 1 })
  assert.equal(rate[0], 16.25)
  assert.equal(storage[0], 65)
  const uniform = buildSoilMaps(2, 2, 1, null, classes, { uniformRate: 10, storage: 40, rateFactor: 2, storageFactor: 1 })
  assert.deepEqual([...uniform.rate], [20, 20, 20, 20])
})

test('roof rainwater and colour helpers', () => {
  assert.equal(roofRainwater(100, 850, 0.8), 68)
  assert.deepEqual(ramp(0, HYPSOMETRY), [47, 107, 58])
  assert.deepEqual(ramp(2, HYPSOMETRY), [241, 238, 230])
  assert.equal(waterColor(0.0001)[3], 0)
  assert.ok(waterColor(0.5)[3] > 200)
})
