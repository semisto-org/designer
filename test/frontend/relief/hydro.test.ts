// Unit tests of the relief's pure modules. Run with `npm run test:relief`
// (Node's own test runner and type stripping: no extra dependency).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDrainage, decodeGrid, downsample, MinHeap, RainSimulation } from '../../../app/frontend/relief/hydro.ts'

function grid(cols: number, rows: number, f: (c: number, r: number) => number): Float32Array {
  const out = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[r * cols + c] = f(c, r)
  return out
}

test('decodeGrid converts centimetres above zMin and fills holes from their neighbours', () => {
  const raw = new Uint16Array([100, 65535, 300, 200, 65535, 65535])
  const heights = decodeGrid(raw.buffer, { cols: 3, rows: 2, zMin: 50, zUnit: 0.01, nodata: 65535 })
  assert.equal(heights[0], 51)
  assert.ok(Math.abs(heights[1] - 52) < 1e-5, `hole is the mean of 51 and 53, got ${heights[1]}`)
  assert.ok(heights.every((h) => Number.isFinite(h)))
  assert.throws(() => decodeGrid(raw.buffer, { cols: 2, rows: 2, zMin: 0, zUnit: 0.01, nodata: 65535 }))
})

test('downsample averages blocks', () => {
  const out = downsample(new Float32Array([1, 3, 5, 7, 1, 3, 5, 7]), 4, 2, 2)
  assert.deepEqual([...out.heights], [2, 6])
  assert.equal(out.cols, 2)
  assert.equal(out.rows, 1)
})

test('MinHeap pops in key order', () => {
  const heap = new MinHeap(10)
  ;[5, 1, 4, 2, 3].forEach((key, i) => heap.push(i, key))
  const keys: number[] = []
  while (heap.size) keys.push([5, 1, 4, 2, 3][heap.pop()])
  assert.deepEqual(keys, [1, 2, 3, 4, 5])
})

test('drainage of a tilted plane flows downhill and conserves area', () => {
  const cols = 20
  const rows = 30
  // Rising to the north: water runs south (towards the last row).
  const heights = grid(cols, rows, (_c, r) => 100 - r * 0.1)
  const { accumulation, depression } = analyzeDrainage(heights, cols, rows, 2)
  const middle = Math.floor(cols / 2)
  assert.ok(accumulation[(rows - 2) * cols + middle] > accumulation[cols + middle])
  assert.ok(depression.every((d) => d === 0))
})

test('drainage finds a closed bowl and its depth', () => {
  const cols = 21
  const rows = 21
  const heights = grid(cols, rows, (c, r) => {
    const d = Math.hypot(c - 10, r - 10)
    return d < 6 ? 10 - (6 - d) * 0.5 : 10 + (d - 6) * 0.01
  })
  const { depression, receiver } = analyzeDrainage(heights, cols, rows, 1)
  const centre = 10 * cols + 10
  assert.ok(Math.abs(depression[centre] - 3) < 0.05, `bowl depth ~3 m, got ${depression[centre]}`)
  assert.equal(receiver[0], -1)
})

test('rain keeps its mass balance: rained = infiltrated + outflow + stored', () => {
  const cols = 30
  const rows = 30
  const heights = grid(cols, rows, (c, r) => 50 + c * 0.05 + Math.sin(r / 3) * 0.3)
  const sim = new RainSimulation(heights, cols, rows, 2, { intensity: 60, infiltration: 5, duration: 10 })
  for (let k = 0; k < 2400; k++) sim.step(0.5)
  assert.ok(sim.rained > 0)
  assert.ok(sim.outflow > 0, 'water leaves the grid')
  assert.equal(sim.raining, false)
  const balance = sim.infiltrated + sim.outflow + sim.stored()
  assert.ok(Math.abs(balance - sim.rained) / sim.rained < 1e-3, `balance ${balance} vs rained ${sim.rained}`)
})

test('a full soil reserve only lets percolation through', () => {
  const heights = new Float32Array(16).fill(10)
  const storage = new Float32Array(16).fill(10)
  const rate = new Float32Array(16).fill(100)
  const sim = new RainSimulation(heights, 4, 4, 1, {
    intensity: 50, duration: 0, infiltrationMap: rate, storageMap: storage, initialFill: 1, percolation: 1,
  })
  for (let k = 0; k < 3600; k++) sim.step(1)
  // One hour of 50 mm/h on a full reserve: 1 mm/h soaks, the rest stays or leaves.
  const soakedMm = (sim.infiltrated / 16) * 1000
  assert.ok(Math.abs(soakedMm - 1) < 0.05, `soaked ${soakedMm} mm`)
})

test('a measured series drives the intensity hour by hour', () => {
  const sim = new RainSimulation(new Float32Array(4), 2, 2, 1, { series: [0, 12, 3] })
  assert.equal(sim.intensity, 0)
  sim.time = 3600 * 1.5
  assert.equal(sim.intensity, 12)
  sim.time = 3600 * 3
  assert.equal(sim.raining, false)
})
