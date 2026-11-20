import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crownShadow, noonSun, plantFit } from '../../../app/frontend/relief/plantFit.ts'
import { sunPosition } from '../../../app/frontend/relief/sun.ts'

const apple = { exposures: ['sun'], soilMoisture: ['moist'], flowering: [4, 5] }

test('a sunny, fresh spot without frost suits an apple tree', () => {
  const fit = plantFit(apple, { sunJune: true, wetness: 'fresh', frost: 'low' })
  assert.equal(fit.level, 'good')
  assert.deepEqual(fit.notes.map((n) => n.key), ['sun', 'soil_match'])
  assert.deepEqual(fit.checks, [])
})

test('a sun lover in the June shade is a poor spot, to check at noon in June', () => {
  const fit = plantFit(apple, { sunJune: false, wetness: 'fresh', frost: 'low' })
  assert.equal(fit.level, 'poor')
  assert.ok(fit.checks.includes('june_noon'))
})

test('a plant that takes half shade is fine in the shade', () => {
  const hazel = { exposures: ['sun', 'partial-shade'], soilMoisture: ['moist'] }
  assert.equal(plantFit(hazel, { sunJune: false, wetness: 'fresh', frost: null }).level, 'good')
})

test('wetness one class away warns, two classes away is poor, and says which way', () => {
  const near = plantFit(apple, { sunJune: true, wetness: 'moist', frost: 'low' })
  assert.equal(near.level, 'fair')
  assert.equal(near.notes[1].key, 'soil_wetter')
  assert.ok(near.checks.includes('after_rain'))
  const far = plantFit({ ...apple, soilMoisture: ['dry'] }, { sunJune: true, wetness: 'moist', frost: 'low' })
  assert.equal(far.level, 'poor')
  const willow = plantFit({ exposures: ['sun'], soilMoisture: ['wet', 'waterlogged'] }, { sunJune: true, wetness: 'dry', frost: null })
  assert.equal(willow.notes[1].key, 'soil_drier')
})

test('a frost pocket warns, about the flowers when they open early', () => {
  const fit = plantFit(apple, { sunJune: true, wetness: 'fresh', frost: 'high' })
  assert.equal(fit.level, 'fair')
  assert.equal(fit.notes.at(-1)!.key, 'frost_flowers')
  assert.ok(fit.checks.includes('spring_frost'))
  const late = plantFit({ ...apple, flowering: [7] }, { sunJune: true, wetness: 'fresh', frost: 'high' })
  assert.equal(late.notes.at(-1)!.key, 'frost_pocket')
})

test('nothing known says unknown', () => {
  assert.equal(plantFit({ exposures: [], soilMoisture: [] }, { sunJune: null, wetness: null, frost: null }).level, 'unknown')
})

test('a crown shadow falls away from the sun, longer when the sun is low', () => {
  // Sun due south (azimuth π), y grows southward: the shadow lies north (y < 0).
  const summer = crownShadow(0, 0, 2, 1, 6, { azimuth: Math.PI, altitude: 1.0 })
  const winter = crownShadow(0, 0, 2, 1, 6, { azimuth: Math.PI, altitude: 0.28 })
  const minY = (ring: Array<{ y: number }>) => Math.min(...ring.map((p) => p.y))
  assert.ok(minY(summer) < 0 && minY(winter) < minY(summer))
  assert.ok(Math.abs(minY(winter)) > 18, `winter shadow ${minY(winter)}`)
  assert.deepEqual(crownShadow(0, 0, 2, 1, 6, { azimuth: Math.PI, altitude: -0.1 }), [])
})

test('noon sun in Yvoir: about 63° high in June, 16° in December, due south', () => {
  const june = noonSun({ year: 2026, month: 6, day: 21 }, 50.33, 4.88, sunPosition)
  const december = noonSun({ year: 2026, month: 12, day: 21 }, 50.33, 4.88, sunPosition)
  assert.ok(Math.abs(june.altitude * 180 / Math.PI - 63.1) < 0.6)
  assert.ok(Math.abs(december.altitude * 180 / Math.PI - 16.2) < 0.6)
  assert.ok(Math.abs(december.azimuth - Math.PI) < 0.1)
})
