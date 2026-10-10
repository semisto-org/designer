import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haloFor, linePath, markAt, simplify } from '../../../app/frontend/map/photos/sketch/marks.ts'

test('simplify drops points too close together, rounds, and keeps the end', () => {
  const kept = simplify([[0.1, 0.1], [0.10001, 0.1], [0.2, 0.2], [0.200004, 0.2000049]])
  assert.deepEqual(kept, [[0.1, 0.1], [0.2, 0.2]])
  assert.deepEqual(simplify([[0.123456, 0.5]]), [[0.1235, 0.5]])
})

test('a line path is scaled to the surface and smoothed through midpoints', () => {
  assert.equal(linePath([[0, 0], [0.5, 0.5], [1, 1]], 1000, 500), 'M0,0 Q500,250 750,375 L1000,500')
  assert.equal(linePath([[0.5, 0.5]], 100, 100), 'M50,50 l0.01,0')
  assert.equal(linePath([], 100, 100), '')
})

test('the eraser finds the topmost mark under the pointer', () => {
  const marks = [
    { type: 'line' as const, color: '#ffffff', width: 0.006, points: [[0.1, 0.5], [0.9, 0.5]] as [number, number][] },
    { type: 'text' as const, color: '#ffffff', size: 0.05, x: 0.4, y: 0.52, text: 'Mare' },
  ]
  assert.equal(markAt(marks, 0.42, 0.5, 1.5), 1)
  assert.equal(markAt(marks, 0.8, 0.505, 1.5), 0)
  assert.equal(markAt(marks, 0.8, 0.9, 1.5), -1)
})

test('light inks get a dark halo and dark inks a light one', () => {
  assert.match(haloFor('#ffffff'), /^rgba\(27/)
  assert.match(haloFor('#1b1712'), /^rgba\(255/)
})
