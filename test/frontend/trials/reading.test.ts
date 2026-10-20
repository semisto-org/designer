import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readingLines } from '../../../app/frontend/trials/reading.ts'

test('a slope: where it leans, where the water runs, the sun, then the room', () => {
  const lines = readingLines({ slope_pct: 9.6, downhill: 'sw', drop_m: 8.2, low_side: 's', area_m2: 1200 }, 1200)
  assert.deepEqual(lines.map((l) => l.key), ['slope', 'water_side', 'sun', 'area'])
  assert.deepEqual(lines[2], { key: 'sun', facing: 'south' })
  assert.deepEqual(lines[3], { key: 'area', area: 1200, count: 24 })
})

test('a gentle slope says less, and water goes to the marked low point', () => {
  const lines = readingLines({ slope_pct: 2.1, downhill: 'n', drop_m: 1 }, null)
  assert.deepEqual(lines, [{ key: 'gentle', downhill: 'n', slope: 2.1 }, { key: 'water_low' }, { key: 'sun', facing: 'north' }])
})

test('flat land, a tiny garden, or nothing known', () => {
  assert.deepEqual(readingLines({ slope_pct: 0.4, area_m2: 60 }, null), [{ key: 'flat' }, { key: 'small', area: 60 }])
  assert.deepEqual(readingLines({}, null), [])
})
