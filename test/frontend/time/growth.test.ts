import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { crownShadow, noonElevation, plantSizeAt, type GrowingPlant } from '../../../app/frontend/map/time/growth.ts'
import { graftOf, plantForm, sizeAt, trainingOf } from '../../../app/frontend/relief/growth.ts'

const walnut: GrowingPlant = {
  strata: 'canopy', plantType: 'tree', growth: { heightM: 20, spreadM: 15, maturityYears: 25, indicative: false },
  training: 'free', graft: null, supportUntil: null,
}

test('the 2D crown follows the 3D growth model', () => {
  const spreads = [0, 5, 15, 30].map((age) => plantSizeAt(walnut, age)!.spread)
  assert.deepEqual(spreads, [...spreads].sort((a, b) => a - b))
  assert.equal(spreads[0], 0.5)
  assert.ok(spreads[3] > 13 && spreads[3] <= 15)
  assert.equal(plantSizeAt(walnut, 'adult')!.spread, 15)
})

test('a support plant gives way after its years, but the plan keeps its footprint', () => {
  const alder = { ...walnut, supportUntil: 12 }
  assert.ok(plantSizeAt(alder, 5))
  assert.equal(plantSizeAt(alder, 15), null)
  assert.ok(plantSizeAt(alder, 'adult'))
})

test('noon sun at 50.5° N: high in June, low in December', () => {
  assert.ok(Math.abs(noonElevation(50.5, 'june') - 62.94) < 0.01)
  assert.ok(Math.abs(noonElevation(50.5, 'december') - 16.06) < 0.01)
})

test('a crown\'s noon shadow: as wide as the crown, stretched north, much longer in December', () => {
  const at: [number, number] = [4.92, 50.5]
  const size = { height: 12, spread: 8 }
  const extent = (ring: [number, number][]) => {
    const lats = ring.map(([, lat]) => lat)
    const lngs = ring.map(([lng]) => lng)
    const mLng = 111_320 * Math.cos((50.5 * Math.PI) / 180)
    return {
      south: (Math.min(...lats) - 50.5) * 111_320, north: (Math.max(...lats) - 50.5) * 111_320,
      width: (Math.max(...lngs) - Math.min(...lngs)) * mLng,
    }
  }
  const june = extent(crownShadow(at, walnut, size, 'june')!)
  const december = extent(crownShadow(at, walnut, size, 'december')!)
  assert.ok(Math.abs(june.width - 8) < 0.05)
  assert.ok(Math.abs(december.width - 8) < 0.05)
  assert.ok(december.north > 3 * june.north, `${december.north} vs ${june.north}`)
  // The ellipsoid crown (trunk 4.56 m, centre 8.28 m, half 3.72 m) at 16° in December:
  // centre 28.7 m north, reaching 28.7 ± √(4² + 12.9²) m.
  assert.ok(Math.abs(december.north - (28.72 + 13.51)) < 0.2, String(december.north))
  assert.ok(Math.abs(december.south - (28.72 - 13.51)) < 0.2, String(december.south))
  assert.ok(june.south < 0, 'in June the shadow starts under the crown')
})

test('low plants and climbers cast no shadow on the plan', () => {
  const herb: GrowingPlant = { ...walnut, strata: 'herbaceous', plantType: 'herb' }
  assert.equal(crownShadow([4.92, 50.5], herb, { height: 0.6, spread: 0.5 }, 'december'), null)
  const vine: GrowingPlant = { ...walnut, strata: 'vine', plantType: 'climber' }
  assert.equal(crownShadow([4.92, 50.5], vine, { height: 6, spread: 2 }, 'december'), null)
})

test('the shared growth cases (checked by the Ruby port too) still hold', () => {
  const { cases } = JSON.parse(readFileSync(new URL('../../fixtures/files/growth_curve_cases.json', import.meta.url), 'utf8'))
  assert.ok(cases.length >= 100)
  for (const { input, expected } of cases) {
    const form = plantForm(input.strata, input.plantType)
    const training = trainingOf(form, input.training)
    const graft = training === 'free' ? graftOf(form, input.graft) : null
    const size = sizeAt({ ...input, training, graft }, input.age)
    if (expected == null) assert.equal(size, null, JSON.stringify(input))
    else {
      assert.ok(Math.abs(size!.height - expected.height) < 1e-5, JSON.stringify(input))
      assert.ok(Math.abs(size!.spread - expected.spread) < 1e-5, JSON.stringify(input))
    }
  }
})
