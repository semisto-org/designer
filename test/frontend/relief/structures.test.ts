import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDesigns, downsampleCrest, pointsAlong, ringCells } from '../../../app/frontend/relief/design.ts'
import { RainSimulation, weirHead } from '../../../app/frontend/relief/hydro.ts'

// A gully running south (rows grow southwards): its floor falls 2 %, its
// flanks rise 20 % on each side of column 20.
const COLS = 41
const ROWS = 60
const gully = Float32Array.from({ length: COLS * ROWS }, (_, i) => {
  const c = i % COLS
  const r = Math.floor(i / COLS)
  return 20 - r * 0.02 + Math.abs(c - 20) * 0.2
})
const across = [{ x: 12, y: 30 }, { x: 28, y: 30 }]

test('the head across a porous crest: free above it, a seep below it', () => {
  assert.equal(weirHead(1, 0.5, 2, 0.1), 0.05)
  assert.equal(weirHead(3, 2.5, 2, 0.1), 0.5)
  // From above the crest to below it: all that stands above passes, a seep of the rest.
  assert.ok(Math.abs(weirHead(2.4, 1, 2, 0.1) - (0.4 + 0.1)) < 1e-9)
  assert.equal(weirHead(1, 1, 2, 0.1), 0)
})

test('a check dam across a gully stands level and holds a pool upstream', () => {
  const { heights, flow, crest, seep, footprints } = applyDesigns(gully, COLS, ROWS, 1, [
    { id: 'dam', type: 'barrier', points: across, height: 0.4, width: 0.8, level: true, seep: 0.05, pool: 30 },
  ])
  const floor = 30 * COLS + 20
  const crestLevel = gully[floor] + 0.4
  assert.ok(Math.abs(heights[floor] - crestLevel) < 0.02, `crest ${heights[floor]} vs ${crestLevel}`)
  // Level: on the flank the crest stays at the same height, and stops where the ground rises above it.
  assert.ok(Math.abs(heights[30 * COLS + 21] - crestLevel) < 0.02)
  assert.equal(heights[30 * COLS + 26], gully[30 * COLS + 26])
  // Porous: the water runs on the gully, the crest is written apart.
  assert.equal(flow[floor], gully[floor])
  assert.ok(Math.abs(crest[floor] - crestLevel) < 0.02)
  assert.ok(Math.abs(seep[floor] - 0.05) < 1e-6)
  assert.ok(Number.isNaN(crest[10 * COLS + 20]))
  // About a triangular pool 0.4 m deep, 20 m long, ±2 m wide at the dam.
  assert.ok(footprints[0].capacity > 3 && footprints[0].capacity < 15, `capacity ${footprints[0].capacity}`)
})

test('a hedge bank follows the ground and is no porous structure', () => {
  const slope = Float32Array.from({ length: 30 * 30 }, (_, i) => 20 - Math.floor(i / 30) * 0.1 + (i % 30) * 0.01)
  const { heights, flow, crest } = applyDesigns(slope, 30, 30, 1, [
    { id: 'bank', type: 'barrier', points: [{ x: 3, y: 15 }, { x: 26, y: 15 }], height: 0.6, width: 1.5, seep: 0, pool: 5 },
  ])
  for (const c of [5, 15, 25]) {
    const i = 15 * 30 + c
    assert.ok(Math.abs(heights[i] - (slope[i] + 0.6)) < 0.02, `bank at column ${c}`)
    assert.equal(flow[i], heights[i])
  }
  assert.ok(Array.from(crest).every((v) => Number.isNaN(v)))
})

test('a porous dam holds the water back and lets it through, an earth one only holds it', () => {
  const dam = (seep: number) => applyDesigns(gully, COLS, ROWS, 1, [
    { id: 'dam', type: 'barrier', points: across, height: 0.4, width: 0.8, level: true, seep, pool: 30 },
  ])
  const run = (ground: Float32Array, crest: { crest: Float32Array; seep: Float32Array } | null) => {
    const sim = new RainSimulation(ground, COLS, ROWS, 1, {
      intensity: 60, infiltration: 0, duration: 20, crestMap: crest?.crest ?? null, seepMap: crest?.seep ?? null,
    })
    for (let k = 0; k < 2400; k++) sim.step(0.5)
    const pool = [27, 28, 29].reduce((sum, r) => sum + sim.depth[r * COLS + 20], 0)
    return { sim, pool }
  }
  const bare = run(gully, null)
  const porous = dam(0.05)
  const leaky = run(porous.flow, downsampleCrest(porous.crest, porous.seep, COLS, ROWS, 1))
  const earth = dam(0)
  const sealed = run(earth.heights, null)
  assert.ok(leaky.pool > bare.pool * 3, `pool ${leaky.pool} vs ${bare.pool} without a dam`)
  // Twenty minutes after the storm the earth dam still holds its pool; the porous one has let it go down the gully.
  assert.ok(sealed.pool > leaky.pool, `earth ${sealed.pool} vs porous ${leaky.pool}`)
  assert.ok(leaky.sim.outflow > sealed.sim.outflow, `outflow ${leaky.sim.outflow} vs ${sealed.sim.outflow}`)
  const balance = leaky.sim.infiltrated + leaky.sim.outflow + leaky.sim.stored()
  assert.ok(Math.abs(balance - leaky.sim.rained) / leaky.sim.rained < 1e-3, 'water is neither made nor lost at the crest')
})

test('half-moons dig a bowl open uphill with a crescent berm downhill', () => {
  // Rising to the north: downhill is south (larger rows).
  const slope = Float32Array.from({ length: 30 * 30 }, (_, i) => 20 - Math.floor(i / 30) * 0.1)
  const { heights, footprints } = applyDesigns(slope, 30, 30, 0.5, [
    { id: 'moons', type: 'half_moon', centres: [{ x: 7.5, y: 7.5 }], radius: 1.5, depth: 0.2, berm: 0.15 },
  ])
  const centre = 15 * 30 + 15
  assert.ok(heights[centre] < slope[centre] - 0.15)
  // Below: the berm; above: the ground, open to the runoff.
  const below = 19 * 30 + 15
  const above = 11 * 30 + 15
  assert.ok(heights[below] > slope[below], 'berm downhill')
  assert.equal(heights[above], slope[above])
  assert.ok(footprints[0].capacity > 0.05, `capacity ${footprints[0].capacity}`)
})

test('points every spacing along a line, and the cells of a strip', () => {
  const points = pointsAlong([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }], 4)
  assert.deepEqual(points.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]), [[0, 0], [4, 0], [6, 2], [6, 6]])
  assert.equal(pointsAlong([{ x: 0, y: 0 }], 4).length, 1)
  const cells = ringCells(10, 10, 1, [{ x: 1.5, y: 1.5 }, { x: 4.5, y: 1.5 }, { x: 4.5, y: 3.5 }, { x: 1.5, y: 3.5 }, { x: 1.5, y: 1.5 }])
  assert.equal(cells.length, 6)
})

test('a grass strip slows the water running over it', () => {
  const slope = Float32Array.from({ length: 20 * 40 }, (_, i) => 20 - Math.floor(i / 20) * 0.05)
  const run = (speedMap: Float32Array | null) => {
    const sim = new RainSimulation(slope, 20, 40, 1, { intensity: 60, infiltration: 0, duration: 0, speedMap })
    for (let k = 0; k < 240; k++) sim.step(0.5)
    let onStrip = 0
    for (let i = 25 * 20; i < 35 * 20; i++) onStrip += sim.depth[i]
    return { outflow: sim.outflow, onStrip }
  }
  const grass = new Float32Array(20 * 40)
  for (let i = 25 * 20; i < 35 * 20; i++) grass[i] = 0.1
  const bare = run(null)
  const slowed = run(grass)
  assert.ok(slowed.outflow < bare.outflow * 0.6, `outflow ${slowed.outflow} vs ${bare.outflow}`)
  // The water stays longer on the strip: more time for the soil to drink it.
  assert.ok(slowed.onStrip > bare.onStrip * 5, `on the strip ${slowed.onStrip} vs ${bare.onStrip}`)
})
