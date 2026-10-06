import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBlocks, TILES, type BlocksInput } from '../../../app/frontend/relief/blocks.ts'

// 20 × 20 cells of 1 m, flat at 100 m, 2 m blocks; a 10 × 6 m house in the
// middle (cells 5–14 × 7–12): eaves at 5 m, ridge at 9 m along x.
function input(withFootprints: boolean): BlocksInput & { zBase: number; x0: number; z0: number } {
  const n = 400
  const ground = new Float32Array(n).fill(100)
  const surface = Float32Array.from(ground)
  const tops = new Float32Array(n)
  const eaves = new Float32Array(n)
  const covered = new Uint8Array(n)
  for (let r = 6; r <= 13; r++) for (let c = 4; c <= 15; c++) covered[r * 20 + c] = 1
  for (let r = 7; r <= 12; r++) {
    for (let c = 5; c <= 14; c++) {
      const roof = 9 - Math.abs(r - 9.5) * (4 / 2.5)
      surface[r * 20 + c] = 100 + roof
      tops[r * 20 + c] = roof
      eaves[r * 20 + c] = 5
    }
  }
  return {
    ground, original: ground, surface, roles: null, cols: 20, rows: 20, cell: 1, block: 2, exaggeration: 1,
    buildings: withFootprints ? { tops, eaves, covered } : null, zBase: 99, x0: 9.5, z0: 9.5,
  }
}

const tilesUsed = (tiles: Uint8Array) => new Set(Array.from(tiles))

test('with footprints: brick walls up to the eaves, roof tiles above', () => {
  const built = buildBlocks(input(true))
  const used = tilesUsed(built.tiles)
  assert.ok(used.has(TILES.brick), 'brick walls')
  assert.ok(used.has(TILES.roof), 'roof')
  assert.ok(!used.has(TILES.leaves), 'no tree around the house')
  // The ridge stands higher than the eaves: some vertex at 9 m above the
  // ground (ground top at storey 0.5 → y = 1 m; 9 m more → ≥ 10 m).
  let highest = 0
  for (let v = 1; v < built.positions.length; v += 3) highest = Math.max(highest, built.positions[v])
  assert.ok(highest >= 9, String(highest))
})

test('without footprints, the house is still read from the surface model', () => {
  const used = tilesUsed(buildBlocks(input(false)).tiles)
  assert.ok(used.has(TILES.roof))
})
