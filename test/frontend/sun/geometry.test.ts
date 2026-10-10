import { test } from 'node:test'
import assert from 'node:assert/strict'
import { biggestLoss, clock, duration, horizonAt, splitPath } from '../../../app/frontend/map/sun/geometry.ts'

const profile = [
  { azimuth: 0, height: 2 },
  { azimuth: 90, height: 10 },
  { azimuth: 180, height: 4 },
  { azimuth: 270, height: 6 },
]

test('the horizon is read in between samples, through north too', () => {
  assert.equal(horizonAt(profile, 90), 10)
  assert.equal(horizonAt(profile, 45), 6)
  assert.equal(horizonAt(profile, 315), 4)
  assert.equal(horizonAt(profile, 360), 2)
  assert.equal(horizonAt([], 120), 0)
})

test('a sun path splits where it crosses the horizon, without gaps', () => {
  const points = [
    { minutes: 480, azimuth: 120, elevation: 3 }, // under the 8.7° horizon at 120°
    { minutes: 540, azimuth: 135, elevation: 9 }, // above the 7.5° horizon at 135°
    { minutes: 600, azimuth: 150, elevation: 12 },
  ]
  const runs = splitPath(points, profile)
  assert.deepEqual(runs.map((r) => r.visible), [false, true])
  assert.equal(runs[1].points[0], points[0])
  assert.equal(runs[1].points.length, 3)

  const flat = splitPath(points, null)
  assert.deepEqual(flat.map((r) => r.visible), [true])
})

test('solar times and durations read the French way', () => {
  assert.equal(clock(590), '9 h 50')
  assert.equal(clock(720), '12 h')
  assert.equal(duration(5.63), '5 h 40')
  assert.equal(duration(16.33), '16 h 20')
})

test('the month the relief takes the most sun', () => {
  const month = (m: number, openHours: number, terrainHours: number | null) =>
    ({ month: m, date: '', openHours, terrainHours, firstSun: null, lastSun: null, irradiationKwhM2: null })
  const loss = biggestLoss([month(6, 16.3, 12.6), month(12, 7.9, 5.6), month(3, 12.1, 8.5)])
  assert.equal(loss?.month.month, 6)
  assert.equal(biggestLoss([month(6, 16.3, 16.2)]), null)
  assert.equal(biggestLoss([month(6, 16.3, null)]), null)
})
