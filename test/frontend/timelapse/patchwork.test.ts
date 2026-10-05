import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PARCEL, insidePolygon } from '../../../app/frontend/components/site/timelapse/model.ts'
import { PARCEL_CENTRE, PIECES, border, terrainCell } from '../../../app/frontend/components/site/timelapse/patchwork.ts'

const key = ([x, y]: [number, number]) => `${x.toFixed(3)},${y.toFixed(3)}`

test("the terrain's own piece is exactly the parcel", () => {
  assert.deepEqual(terrainCell(), PARCEL)
})

test('a ring of pieces surrounds the terrain, none overlapping it', () => {
  assert.equal(PIECES.filter((p) => p.ring).length, PARCEL.length)
  const inner = PARCEL.map(([x, y]): [number, number] => [PARCEL_CENTRE[0] + (x - PARCEL_CENTRE[0]) * 0.98, PARCEL_CENTRE[1] + (y - PARCEL_CENTRE[1]) * 0.98])
  for (const p of PIECES) {
    for (const [x, y] of p.poly) assert.ok(!insidePolygon(x, y, inner), `corner ${x},${y} inside the terrain`)
  }
})

test('neighbouring pieces share their borders point for point, so they fit like a puzzle', () => {
  // Away from the edge of the patchwork, where pieces have neighbours on every side.
  const near = ([x, y]: [number, number]) => Math.abs(x - 500) < 3000 && Math.abs(y - 340) < 3000
  const terrain = new Set(PARCEL.map(key))
  const uses = new Map<string, number>()
  for (const p of PIECES) {
    p.poly.forEach((a, i) => {
      const b = p.poly[(i + 1) % p.poly.length]
      if (!near(a) || !near(b) || (terrain.has(key(a)) && terrain.has(key(b)))) return
      const k = [key(a), key(b)].sort().join('|')
      uses.set(k, (uses.get(k) ?? 0) + 1)
    })
  }
  const lonely = [...uses].filter(([, n]) => n !== 2)
  assert.ok(uses.size > 1000)
  assert.deepEqual(lonely, [])
})

test('borders are drawn by hand: wavy, and the long ones often carry a tab', () => {
  const line = border([0, 0], [600, 0])
  assert.deepEqual(line[0], [0, 0])
  assert.deepEqual(line[line.length - 1], [600, 0])
  assert.ok(line.some(([, y]) => Math.abs(y) > 5))
  const tabs = Array.from({ length: 40 }, (_, i) => border([i * 1000, 0], [i * 1000 + 600, 37]))
    .filter((l) => l.some(([, y]) => Math.abs(y) > 60)).length
  assert.ok(tabs > 15, `${tabs} tabs out of 40`)
})

test('every piece has a few crowns unless it is a field, and they stay inside it', () => {
  for (const p of PIECES) {
    if (p.type === 'field') assert.equal(p.blobs.length, 0)
    for (const [x, y] of p.blobs) assert.ok(insidePolygon(x, y, p.poly))
  }
  assert.ok(PIECES.filter((p) => p.type === 'garden' && p.blobs.length > 0).length > 20)
})
