import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, bucketOf, dueOf, isPlantingMonth, seasonOf, yearAhead } from '../../../app/frontend/tasks/dates.ts'

test('days add across months and years', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02')
})

test('due dates read against today', () => {
  assert.equal(dueOf('2026-10-01', '2026-10-11').kind, 'overdue')
  assert.equal(dueOf('2026-10-11', '2026-10-11').kind, 'today')
  assert.equal(dueOf('2026-10-12', '2026-10-11').kind, 'tomorrow')
  assert.equal(dueOf('2026-10-15', '2026-10-11').tone, 'soon')
  assert.equal(dueOf('2026-12-15', '2026-10-11').tone, 'later')
})

test('buckets: overdue, this week, later, no date', () => {
  assert.equal(bucketOf('2026-10-10', '2026-10-11'), 'overdue')
  assert.equal(bucketOf('2026-10-18', '2026-10-11'), 'this_week')
  assert.equal(bucketOf('2026-10-19', '2026-10-11'), 'later')
  assert.equal(bucketOf(undefined, '2026-10-11'), 'no_due')
})

test('the year ahead starts with this month and crosses the new year', () => {
  const months = yearAhead('2026-10-11')
  assert.equal(months.length, 12)
  assert.equal(months[0].key, '2026-10')
  assert.equal(months[3].key, '2027-01')
})

test('seasons and the planting window', () => {
  assert.equal(seasonOf(0), 'winter')
  assert.equal(seasonOf(3), 'spring')
  assert.equal(seasonOf(6), 'summer')
  assert.equal(seasonOf(9), 'autumn')
  assert.deepEqual([0, 1, 2, 3, 9, 10, 11].map(isPlantingMonth), [true, true, true, false, false, true, true])
})
