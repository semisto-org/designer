import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grade } from '../../../app/frontend/relief/grading.ts'

// The same cases as test/services/relief/grading_test.rb: a 1 m grid of 81 × 81
// cells on a slope of 10 % rising to the NORTH (y runs south, so heights fall as y grows).
const N = 81
const C = 40
const base = Float32Array.from({ length: N * N }, (_, i) => 200 + (C - Math.floor(i / N)) * 0.1)
const square = (size: number) => {
  const h = size / 2
  return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dy]) => ({ x: C + 0.5 + dx, y: C + 0.5 + dy }))
}
const near = (a: number, b: number, tolerance: number, message?: string) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b} ± ${tolerance} ${message ?? ''}`)

test('a terrace hung in the middle balances its cut and its fill', () => {
  const g = grade(base, N, N, 1, { id: 1, type: 'grade', shape: 'plateau', ring: square(20) })
  near(g.level!, 200, 0.1)
  assert.ok(g.cut > 100)
  near(g.cut, g.fill, g.cut * 0.1)
  near(g.maxCut, 1, 0.15)
})

test('hung on its uphill edge a terrace is all fill; at a given level it sits there', () => {
  const upper = grade(base, N, N, 1, { id: 1, type: 'grade', shape: 'plateau', ring: square(20), hinge: 'upper' })
  near(upper.level!, 201, 0.15)
  assert.equal(upper.cut, 0)
  assert.ok(upper.fill > 400)
  const low = grade(base, N, N, 1, { id: 1, type: 'grade', shape: 'plateau', ring: square(20), level: 199 })
  assert.equal(low.level, 199)
  assert.ok(low.cut > 400)
  assert.equal(low.fill, 0)
})

test('a bench along the contour cuts uphill and fills downhill; a bank is all fill', () => {
  const line = [{ x: C - 20, y: C }, { x: C + 20, y: C }]
  const bench = grade(base, N, N, 1, { id: 1, type: 'grade', shape: 'bench', points: line, width: 4 })
  near(bench.cut, bench.fill, bench.cut * 0.3)
  assert.ok(bench.cut > 5)
  const bank = grade(base, N, N, 1, { id: 2, type: 'grade', shape: 'bank', points: line, width: 2, height: 1 })
  assert.equal(bank.cut, 0)
  near(bank.fill, 40 * 2 + 40 * 1.5, 25)
  near(bank.maxFill, 1, 0.15)
})

test('a bench at a grade starts from the ground at its first point', () => {
  const ramp = grade(base, N, N, 1, { id: 1, type: 'grade', shape: 'bench', points: [{ x: C, y: C + 20 }, { x: C, y: C - 20 }], width: 3, grade: -5 })
  near(ramp.level!, 198, 0.1)
  assert.ok(ramp.cut > ramp.fill)
})

test('nothing to grade without a shape', () => {
  assert.equal(grade(base, N, N, 1, { id: 1, type: 'grade', shape: 'plateau', ring: [] }).cells.length, 0)
})
