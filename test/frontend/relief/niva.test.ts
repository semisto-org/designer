import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBlocks, TILES } from '../../../app/frontend/relief/blocks.ts'
import { createNivaState, stepNiva, type NivaTerrain } from '../../../app/frontend/relief/niva.ts'
import { landcoverRoles, ROLE } from '../../../app/frontend/relief/roles.ts'

const classes = {
  1: { label: 'Route', rate: 1, storage: 1, color: '#777', kind: 'road' as const },
  2: { label: 'Bâti', rate: 0, storage: 0, color: '#b44', kind: 'building' as const },
  5: { label: 'Eau', rate: 0, storage: 0, color: '#26c', kind: 'water' as const },
  7: { label: 'Prairie', rate: 15, storage: 50, color: '#9c6' },
}

test('land cover roles come from the classes, and none without any kind', () => {
  const roles = landcoverRoles(new Uint8Array([1, 2, 5, 7, 99]), classes)
  assert.deepEqual([...(roles as Uint8Array)], [ROLE.road, ROLE.building, ROLE.water, ROLE.none, ROLE.none])
  assert.equal(landcoverRoles(new Uint8Array([7]), { 7: classes[7] }), null)
  assert.equal(landcoverRoles(null, classes), null)
})

function plane(cols: number, rows: number, z: (c: number, r: number) => number) {
  const heights = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = z(c, r)
  return heights
}

function terrain(cols: number, rows: number, heights: Float32Array, cellAt: NivaTerrain['cell'] = () => ({ role: 0, above: 0, dug: 0 })): NivaTerrain {
  return {
    width: cols - 1,
    depth: rows - 1,
    height: (x, z) => heights[Math.min(rows - 1, Math.max(0, Math.round(z))) * cols + Math.min(cols - 1, Math.max(0, Math.round(x)))],
    cell: (x, z) => (x < 0 || z < 0 || x > cols - 1 || z > rows - 1 ? null : cellAt(x, z)),
  }
}

function drive(state: ReturnType<typeof createNivaState>, ground: NivaTerrain, seconds: number, throttle = 1) {
  for (let t = 0; t < seconds; t += 0.02) stepNiva(state, { throttle, steer: 0, brake: false }, ground, 0.02)
  return state
}

test('the Niva drives north on flat ground and keeps to the meadow speed', () => {
  const heights = plane(200, 200, () => 100)
  const state = drive(createNivaState(100, 150, 0), terrain(200, 200, heights), 10)
  assert.ok(state.z < 120, `it moved north (z = ${state.z})`)
  assert.ok(Math.abs(state.x - 100) < 0.01, 'straight ahead')
  assert.ok(state.speed * 3.6 <= 41, `about 40 km/h at most (${state.speed * 3.6})`)
})

test('the Niva goes faster on a road', () => {
  const heights = plane(400, 400, () => 100)
  const road = terrain(400, 400, heights, () => ({ role: ROLE.road, above: 0, dug: 0 }))
  const state = drive(createNivaState(200, 390, 0), road, 12)
  assert.ok(state.speed * 3.6 > 41, `beyond the 40 km/h of a meadow (${state.speed * 3.6} km/h)`)
})

test('a building stops the Niva', () => {
  const heights = plane(100, 100, () => 100)
  const ground = terrain(100, 100, heights, (_x, z) => (z < 50 ? { role: ROLE.building, above: 6, dug: 0 } : { role: 0, above: 0, dug: 0 }))
  const state = createNivaState(50, 60, 0)
  let status = null
  for (let t = 0; t < 5; t += 0.02) {
    stepNiva(state, { throttle: 1, steer: 0, brake: false }, ground, 0.02)
    status ??= state.status
  }
  assert.ok(state.z > 50, 'it never enters the building')
  assert.equal(status, 'building')
})

test('a slope too steep makes the wheels spin', () => {
  // 80 % uphill northwards.
  const heights = plane(100, 100, (_c, r) => 200 - r * 0.8)
  const state = drive(createNivaState(50, 80, 0), terrain(100, 100, heights), 1)
  assert.equal(state.status, 'too_steep')
  assert.ok(state.speed <= 0, 'it slides back')
})

test('the relief in blocks: flat grass, a pond in water tiles, a tree with a trunk', () => {
  const cols = 20
  const rows = 20
  const ground = plane(cols, rows, () => 50)
  const surface = new Float32Array(ground)
  surface[10 * cols + 10] = 62 // a 12 m tree
  const roles = new Uint8Array(cols * rows)
  for (const i of [2 * cols + 2, 2 * cols + 3, 3 * cols + 2, 3 * cols + 3]) roles[i] = ROLE.water
  const built = buildBlocks({
    ground, original: ground, surface, roles, cols, rows, cell: 1, block: 2, exaggeration: 1, zBase: 40, x0: 10, z0: 10,
  })
  assert.equal(built.cols, 10)
  assert.equal(built.rows, 10)
  assert.ok(built.faces > 0)
  assert.equal(built.indices.length, built.faces * 6)
  const tiles = new Set(built.tiles)
  assert.ok(tiles.has(TILES.grass), 'grass on top')
  assert.ok(tiles.has(TILES.water), 'the pond is water')
  assert.ok(tiles.has(TILES.leaves) && tiles.has(TILES.log), 'a crown on a trunk')
  // The ground is 10 m above zBase: five 2 m storeys.
  assert.equal(built.groundTops[0], 10)
})

test('blocks stay cubic on screen: one storey is a block of displayed height', () => {
  const cols = 10
  const rows = 10
  const ground = plane(cols, rows, () => 50)
  const built = buildBlocks({
    ground, original: ground, surface: null, roles: null, cols, rows, cell: 1, block: 2, exaggeration: 2, zBase: 40, x0: 5, z0: 5,
  })
  // 10 m × 2 = 20 displayed metres = 10 storeys of 2 m, each 1 m in the group's frame.
  assert.equal(built.groundTops[0], 10)
})
