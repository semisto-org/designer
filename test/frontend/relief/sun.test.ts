import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daylightWindow, shadowMask, sunHours, sunPosition, zonedTime, zoneOffsetMs } from '../../../app/frontend/relief/sun.ts'

const DEG = Math.PI / 180

test('zonedTime builds wall-clock instants in the map time zone', () => {
  assert.equal(zonedTime(2026, 6, 21, 14, 0, 'Europe/Brussels').toISOString(), '2026-06-21T12:00:00.000Z')
  assert.equal(zonedTime(2026, 12, 21, 14, 0, 'Europe/Brussels').toISOString(), '2026-12-21T13:00:00.000Z')
  assert.equal(zonedTime(2026, 6, 21, 14, 0, 'America/Montreal').toISOString(), '2026-06-21T18:00:00.000Z')
  assert.equal(zoneOffsetMs(new Date('2026-01-10T00:00:00Z'), 'Europe/Brussels'), 3600000)
})

test('sun at solar noon on the summer solstice in Wallonia is high in the south', () => {
  // Solar noon at 4.9° E ≈ 11:40 UTC.
  const sun = sunPosition(new Date('2026-06-21T11:40:00Z'), 50.34, 4.9)
  assert.ok(Math.abs(sun.altitude / DEG - 63.1) < 0.6, `altitude ${sun.altitude / DEG}`)
  assert.ok(Math.abs(sun.azimuth / DEG - 180) < 3, `azimuth ${sun.azimuth / DEG}`)
  const morning = sunPosition(new Date('2026-06-21T05:00:00Z'), 50.34, 4.9)
  assert.ok(morning.azimuth / DEG > 45 && morning.azimuth / DEG < 100, 'morning sun in the east-north-east')
})

test('a wall casts a shadow h / tan(altitude) long', () => {
  const cols = 40
  const rows = 5
  const surface = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) surface[r * cols + 10] = 5
  // Sun in the west, 30° high: the wall shades the cells east of it, 5/tan(30°) ≈ 8.7 m.
  const mask = shadowMask(surface, cols, rows, 1, { azimuth: 270 * DEG, altitude: 30 * DEG })
  const row = 2 * cols
  assert.equal(mask[row + 10], 1, 'the wall top is in the sun')
  assert.equal(mask[row + 11], 0)
  assert.equal(mask[row + 18], 0)
  assert.equal(mask[row + 20], 1)
  assert.equal(mask[row + 5], 1, 'west of the wall is in the sun')
  assert.ok(shadowMask(surface, cols, rows, 1, { azimuth: 0, altitude: -0.1 }).every((v) => v === 0))
})

test('sun hours on open ground equal the day length', async () => {
  const day = zonedTime(2026, 6, 21, 0, 0, 'Europe/Brussels')
  const { hours, daylight } = await sunHours(new Float32Array(9), 3, 3, 1, 50.34, 4.9, day, { stepMinutes: 30 })
  assert.ok(Math.abs(daylight - 16.5) < 0.6, `daylight ${daylight}`)
  assert.ok(hours.every((h) => h === daylight))
  const window = daylightWindow(50.34, 4.9, day)
  assert.ok(window && window.rise > 5 * 60 && window.rise < 6 * 60 && window.set > 21 * 60, JSON.stringify(window))
})
