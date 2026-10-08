import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dayOfYear, dayOfYearOf, frostIsRare, pencilPath, washBar, wettestAndDriest, yearFraction, type ObservedMonth,
} from '../../../app/frontend/components/observed_climate/model.ts'

test('days of the year in a non-leap year', () => {
  assert.equal(dayOfYear('01-01'), 1)
  assert.equal(dayOfYear('04-18'), 108)
  assert.equal(dayOfYear('12-31'), 365)
  assert.equal(dayOfYear(null), null)
  assert.equal(dayOfYear('13-01'), null)
  assert.equal(dayOfYearOf(new Date(2024, 1, 29)), 59)
  assert.equal(dayOfYearOf(new Date(2024, 2, 1)), 60)
  assert.equal(yearFraction(1), 0)
  assert.equal(yearFraction(366), 1)
})

test('wettest and driest month', () => {
  const months: ObservedMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, meanTempC: 10, meanMinC: 5, meanMaxC: 15, rainMm: 60 }))
  months[3].rainMm = 40
  months[11].rainMm = 95
  assert.deepEqual(wettestAndDriest(months), { wettest: 11, driest: 3 })
  assert.equal(wettestAndDriest(months.slice(1)), null)
})

test('rare frost', () => {
  assert.equal(frostIsRare(14, 30), true)
  assert.equal(frostIsRare(15, 30), false)
  assert.equal(frostIsRare(0, 0), false)
})

test('hand-drawn paths are stable between renders', () => {
  const points: [number, number][] = [[0, 10], [10, 5], [20, 8]]
  assert.equal(pencilPath(points), pencilPath(points))
  assert.match(pencilPath(points), /^M[\d.-]+,[\d.-]+ C/)
  assert.equal(pencilPath([]), '')
  assert.match(washBar(0, 10, 20, 50, 3), /Z$/)
})
