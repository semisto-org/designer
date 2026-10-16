import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLANTING_SIZE, calendarYear, growthShare, insideRing, plantForm, scatter, scenePlants, sizeAt, yearsBetween,
  type GrowingPlantsData, type GrowthInputs,
} from '../../../app/frontend/relief/growth.ts'
import type { GridMeta } from '../../../app/frontend/relief/grid.ts'

const apple = { strata: 'sub_canopy' as const, heightM: 5, spreadM: 4, maturityYears: 12 }

test('growth starts at nothing, rises and levels off at maturity', () => {
  assert.equal(growthShare(0, 12), 0)
  assert.equal(growthShare(-1, 12), 0)
  const shares = [1, 3, 6, 12, 20].map((age) => growthShare(age, 12))
  for (let i = 1; i < shares.length; i++) assert.ok(shares[i] > shares[i - 1] || shares[i] === 1)
  assert.ok(shares[3] > 0.9, `about done at maturity (${shares[3]})`)
  assert.equal(growthShare(40, 12), 1)
  // A slow start: the first year is a small part of the way.
  assert.ok(shares[0] < 0.25)
})

test('a plant is its planting size the year it goes in, its adult size later, nothing before', () => {
  assert.equal(sizeAt(apple, -0.5), null)
  assert.deepEqual(sizeAt(apple, 0), PLANTING_SIZE.sub_canopy)
  const adult = sizeAt(apple, 30)!
  assert.equal(adult.height, 5)
  assert.equal(adult.spread, 4)
  const young = sizeAt(apple, 4)!
  assert.ok(young.height > 1.3 && young.height < 5)
})

test('a plant smaller than its planting size never shrinks or overgrows', () => {
  const thyme = { strata: 'herbaceous' as const, heightM: 0.1, spreadM: 0.15, maturityYears: 2 }
  assert.deepEqual(sizeAt(thyme, 0), { height: 0.1, spread: 0.15 })
  assert.deepEqual(sizeAt(thyme, 10), { height: 0.1, spread: 0.15 })
})

test('the form follows the strata, then the plant type', () => {
  assert.equal(plantForm('canopy', null), 'tree')
  assert.equal(plantForm('shrub', null), 'bush')
  assert.equal(plantForm('vine', null), 'climber')
  assert.equal(plantForm('herbaceous', 'climber'), 'climber')
  assert.equal(plantForm('ground_cover', null), 'mat')
  assert.equal(plantForm('herbaceous', null), 'clump')
  assert.equal(plantForm('root', null), 'clump')
})

test('scatter spreads exactly the plants asked for inside the patch, the same way each time', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  const points = scatter(square, 37, 4)
  assert.equal(points.length, 37)
  for (const p of points) assert.ok(insideRing(square, p.x, p.y))
  assert.deepEqual(scatter(square, 37, 4), points)
  assert.deepEqual(scatter(square, 0, 4), [])
  const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
  assert.equal(scatter(triangle, 50, 1).length, 50)
})

test('years count from the first planting, and a calendar year follows', () => {
  assert.ok(Math.abs(yearsBetween('2026-03-01', '2031-03-01') - 5) < 0.01)
  assert.equal(calendarYear('2026-03-01', 0), 2026)
  assert.equal(calendarYear('2026-03-01', 7.6), 2033)
})

// A grid of 100 × 100 cells of 1 m around Beauvechain, in Web Mercator.
const meta: GridMeta = { west: 525_000, north: 6_590_000, step: 1.5, cols: 100, rows: 100, cellSizeM: 1 }
const R = 6378137
const lngLat = (mx: number, my: number): [number, number] => [
  (mx / R) * 180 / Math.PI, (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180 / Math.PI,
]
const inputs = (over: Partial<GrowthInputs> = {}): GrowthInputs => ({
  speciesId: 1, varietyId: null, strata: 'shrub', name: 'Cassis', latinName: 'Ribes nigrum', foliage: 'deciduous',
  plantType: 'shrub', heightM: 1.5, spreadM: 1.2, maturityYears: 4, indicative: false, ...over,
})

test('scene plants: points where they stand, planted ones from their year, patches filled but not twice', () => {
  const [lng, lat] = lngLat(525_000 + 15, 6_590_000 - 15)
  const data: GrowingPlantsData = {
    today: '2028-06-01',
    origin: '2026-06-01',
    plants: [
      { ...inputs(), id: 1, lng, lat, number: 3, ownName: null, plantedOn: '2026-06-01' },
      { ...inputs({ speciesId: 2, strata: 'canopy', plantType: 'tree' }), id: 2, lng, lat, number: null, ownName: null, plantedOn: null },
    ],
    patches: [{
      id: 9,
      name: 'Massif',
      ring: [lngLat(525_000, 6_590_000), lngLat(525_000 + 30, 6_590_000), lngLat(525_000 + 30, 6_590_000 - 30), lngLat(525_000, 6_590_000 - 30)],
      lines: [{ ...inputs(), quantity: 10, shown: 10 }],
    }],
  }
  const plants = scenePlants(meta, data)
  const first = plants[0]
  assert.ok(Math.abs(first.x - 10) < 0.01 && Math.abs(first.y - 10) < 0.01, `${first.x}, ${first.y}`)
  assert.equal(first.form, 'bush')
  assert.equal(first.start, 0)
  // Not planted yet: from today, two years after the first planting.
  assert.ok(Math.abs(plants[1].start - 2) < 0.01)
  assert.equal(plants[1].form, 'tree')
  // Ten currants in the patch, one of which is the point already placed in it.
  const fromPatch = plants.filter((p) => p.patch)
  assert.equal(fromPatch.length, 9)
  assert.ok(fromPatch.every((p) => p.x >= 0 && p.x <= 20 && p.y >= 0 && p.y <= 20))
})
