import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDesigns, capacity, downsampleDesigned, heightAt, insideRing } from '../../../app/frontend/relief/design.ts'

test('heightAt interpolates bilinearly', () => {
  const heights = new Float32Array([0, 2, 4, 6])
  assert.equal(heightAt(heights, 2, 2, 1, 0.5, 0.5), 3)
})

test('a pond dug on flat ground holds about the volume of its bowl', () => {
  const cols = 41
  const rows = 41
  const flat = new Float32Array(cols * rows).fill(10)
  const ring = Array.from({ length: 33 }, (_, k) => {
    const a = (k % 32) / 32 * Math.PI * 2
    return { x: 20 + Math.cos(a) * 8, y: 20 + Math.sin(a) * 8 }
  })
  const { heights, footprints } = applyDesigns(flat, cols, rows, 1, [{ id: 1, type: 'pond', ring, depth: 1, berm: 0.3 }])
  assert.ok(heights[20 * cols + 20] < 9.05, 'the centre is dug ~1 m')
  assert.ok(heights[20 * cols + 29] > 10.2, 'the berm stands outside the shore')
  // Bowl volume π R² d / 2 ≈ 100 m³ below the original ground, plus the 0.3 m the berm adds.
  const volume = footprints[0].capacity
  assert.ok(volume > 100 && volume < 220, `capacity ${volume}`)
})

test('a swale across a slope digs a trench and a downhill berm', () => {
  const cols = 30
  const rows = 30
  // Rising to the north.
  const slope = Float32Array.from({ length: cols * rows }, (_, i) => 20 - Math.floor(i / cols) * 0.1)
  const points = [{ x: 3, y: 15 }, { x: 26, y: 15 }]
  const { heights, footprints } = applyDesigns(slope, cols, rows, 1, [{ id: 's', type: 'swale', points, width: 2, depth: 0.5, berm: 0.4 }])
  assert.ok(heights[15 * cols + 10] < slope[15 * cols + 10] - 0.45)
  // Downhill = south = larger rows.
  assert.ok(heights[17 * cols + 10] > slope[17 * cols + 10])
  assert.ok(footprints[0].capacity > 5, `capacity ${footprints[0].capacity}`)
})

test('capacity is zero for an empty footprint and the spill level bounds it', () => {
  assert.equal(capacity(new Float32Array(4), 2, 2, 1, []), 0)
})

test('downsampleDesigned keeps trench bottoms and berm crests', () => {
  const base = new Float32Array([10, 10, 10, 10])
  const dug = new Float32Array([10, 9, 10, 10])
  assert.deepEqual([...downsampleDesigned(base, dug, 2, 2, 2)], [9])
  const raised = new Float32Array([10, 10.4, 10, 10])
  assert.ok(Math.abs(downsampleDesigned(base, raised, 2, 2, 2)[0] - 10.4) < 1e-5)
})

test('insideRing', () => {
  const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }]
  assert.equal(insideRing(2, 2, square), true)
  assert.equal(insideRing(5, 2, square), false)
})
