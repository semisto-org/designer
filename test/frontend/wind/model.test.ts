import assert from 'node:assert/strict'
import { test } from 'node:test'
import { petalsOf, pointIndex, prevailingOf, sectorAround, viewForSeason, type WindRoses } from '../../../app/frontend/components/wind/model.ts'

const sector = (deg: number, pct: number) => ({ deg, pct, meanKmh: 12, classes: [0, pct, 0, 0] })
const rose = (prevailingDeg: number) => ({ hours: 100, calmPct: 2, meanKmh: 12, prevailingDeg, sectors: [sector(0, 10), sector(270, 60)] })
const roses: WindRoses = {
  classesKmh: [10, 20, 30],
  year: rose(270),
  seasons: { winter: rose(247.5), spring: rose(45), summer: null, autumn: rose(270) },
  coldSpring: { coldC: 5, minKmh: 7.2, hoursPct: 6, prevailingDeg: 45, northEastPct: 80, sectors: [{ deg: 45, pct: 80 }] },
  strong: { percentile: 98, thresholdKmh: 40, maxKmh: 70, prevailingDeg: 225, sectors: [{ deg: 225, pct: 50 }] },
}

test('petals and prevailing wind of each view', () => {
  assert.deepEqual(petalsOf(roses, 'year').map((p) => p.pct), [10, 60])
  assert.deepEqual(petalsOf(roses, 'cold_spring'), [{ deg: 45, pct: 80, classes: null }])
  assert.deepEqual(petalsOf(roses, 'summer'), [])
  assert.equal(prevailingOf(roses, 'winter'), 247.5)
  assert.equal(prevailingOf(roses, 'strong'), 225)
  assert.equal(prevailingOf(roses, 'summer'), null)
})

test('the season filter of the sectors panel picks its rose', () => {
  assert.equal(viewForSeason('all'), 'year')
  assert.equal(viewForSeason('spring'), 'spring')
})

test('a sector proposed around a wind spans three compass points', () => {
  assert.deepEqual(sectorAround(247.5), { from: 225, to: 270 })
  assert.deepEqual(sectorAround(5), { from: 337.5, to: 22.5 })
  assert.equal(pointIndex(350), 0)
  assert.equal(pointIndex(270), 12)
})
