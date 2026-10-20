import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GARDEN_YEARS, SEASONS, VIDEO_DURATION, VIDEO_SECONDS, gardenAt, gardenGeoJson, gardenPlants, lookOf, seasonOf, spriteOf, videoMoment, yearFraction, yearNow,
  type PublicGrowth,
} from '../../../app/frontend/public_maps/garden.ts'

const inputs = { speciesId: 1, varietyId: null, name: 'Pommier', foliage: 'deciduous', plantType: 'tree', indicative: false }
const apple = { ...inputs, strata: 'sub_canopy' as const, latinName: 'Malus domestica', heightM: 5, spreadM: 4, maturityYears: 12 }

function growth(overrides: Partial<PublicGrowth> = {}): PublicGrowth {
  return {
    today: '2026-10-19',
    origin: '2025-11-20',
    plants: [{ ...apple, id: 7, training: null, graft: null, lng: 4.9002, lat: 50.3401, plantedOn: '2025-11-20' }],
    patches: [],
    ...overrides,
  }
}

test('a plant is painted after its genus, else after its layer of the forest', () => {
  assert.equal(lookOf(apple, 1), 'pommier')
  assert.equal(lookOf({ ...apple, latinName: 'Prunus spinosa' }, 1), 'prunellier')
  assert.equal(lookOf({ ...apple, latinName: 'Prunus avium' }, 1), 'cerisier')
  assert.equal(lookOf({ ...apple, latinName: 'Ribes nigrum' }, 1), 'cassis')
  assert.equal(lookOf({ ...apple, latinName: 'Ribes uva-crispa' }, 1), 'groseillier_maq')
  assert.equal(lookOf({ ...apple, latinName: 'Taxus baccata', strata: 'canopy', foliage: 'evergreen' }, 1), 'houx')
  assert.ok(['noyer', 'chataignier', 'aulne'].includes(lookOf({ ...apple, latinName: 'Tilia cordata', strata: 'canopy' }, 5)))
  assert.ok(['fraisier', 'bugle'].includes(lookOf({ ...apple, latinName: null, strata: 'ground_cover' }, 2)))
})

test('the crown follows the seasons: bare in winter, blossom in April, fruit in late summer, autumn colours', () => {
  assert.equal(spriteOf('pommier', SEASONS.winter, 0), 'small_bare')
  assert.equal(spriteOf('pommier', SEASONS.spring, 0), 'fruit_blossom')
  assert.equal(spriteOf('pommier', SEASONS.summer, 0), 'pommier_fruit')
  assert.equal(spriteOf('pommier', SEASONS.autumn, 0), 'fruit_autumn')
  assert.equal(spriteOf('houx', SEASONS.winter, 0), 'houx', 'an evergreen keeps its leaves')
  assert.equal(spriteOf('noyer', SEASONS.summer, 0), 'noyer')
})

test('the season of a date', () => {
  assert.equal(seasonOf(yearFraction(new Date('2026-01-15T12:00:00Z'))), 'winter')
  assert.equal(seasonOf(yearFraction(new Date('2026-04-20T12:00:00Z'))), 'spring')
  assert.equal(seasonOf(yearFraction(new Date('2026-07-20T12:00:00Z'))), 'summer')
  assert.equal(seasonOf(yearFraction(new Date('2026-10-19T12:00:00Z'))), 'autumn')
  assert.equal(seasonOf(yearFraction(new Date('2026-12-24T12:00:00Z'))), 'winter')
})

test('today on the slider: the years since year 0, never beyond the slider', () => {
  assert.ok(Math.abs(yearNow(growth(), new Date('2026-11-20T00:00:00Z')) - 1) < 0.01)
  assert.equal(yearNow(growth(), new Date('2020-01-01T00:00:00Z')), 0)
  assert.equal(yearNow(growth(), new Date('2080-01-01T00:00:00Z')), GARDEN_YEARS)
})

test('the crown grows over the years and is not there before it is planted', () => {
  const plants = gardenPlants(growth({ plants: [{ ...growth().plants[0], plantedOn: '2027-11-20' }] }))
  assert.equal(gardenAt(plants, 1, SEASONS.summer).length, 0, 'planted in year 2')
  const year5 = gardenAt(plants, 5, SEASONS.summer)[0].diameter
  const year15 = gardenAt(plants, 15, SEASONS.summer)[0].diameter
  assert.ok(year15 > year5)
  assert.ok(year15 <= 4)
})

test('a patch is spread with its plants, always at the same places, inside its ring', () => {
  const ring = [[4.9, 50.34], [4.9003, 50.34], [4.9003, 50.3402], [4.9, 50.3402], [4.9, 50.34]]
  const data = growth({
    plants: [],
    patches: [{ id: 3, ring, lines: [{ ...apple, latinName: 'Fragaria vesca', strata: 'ground_cover', speciesId: 9, quantity: 12, shown: 12 }] }],
  })
  const first = gardenPlants(data)
  assert.equal(first.length, 12)
  assert.deepEqual(gardenPlants(data).map((p) => [p.lng, p.lat]), first.map((p) => [p.lng, p.lat]))
  for (const p of first) {
    assert.ok(p.lng > 4.9 && p.lng < 4.9003 && p.lat > 50.34 && p.lat < 50.3402)
    assert.equal(p.look, 'fraisier')
  }
})

test('the painted garden as GeoJSON: tallest last, sized from the sprite side', () => {
  const data = growth({
    plants: [
      { ...growth().plants[0], id: 1, plantedLongAgo: true, plantedOn: null },
      { ...growth().plants[0], id: 2, latinName: 'Juglans regia', strata: 'canopy', heightM: 20, spreadM: 15, maturityYears: 40, plantedLongAgo: true, plantedOn: null },
    ],
  })
  const json = gardenGeoJson(gardenAt(gardenPlants(data), 10, SEASONS.summer))
  assert.equal(json.features.length, 2)
  const [low, high] = json.features.map((f) => f.properties!)
  assert.ok(high.height > low.height)
  assert.equal(high.sprite, 'garden-noyer')
  assert.ok(high.scale > 0)
})

test('the video starts at planting in winter and ends on year 30 in summer', () => {
  assert.deepEqual(videoMoment(0), { year: 0, f: SEASONS.winter })
  const end = videoMoment(VIDEO_DURATION)
  assert.equal(end.year, GARDEN_YEARS)
  assert.ok(Math.abs(end.f - SEASONS.summer) < 1e-9)
  assert.equal(seasonOf(videoMoment(VIDEO_SECONDS.still + VIDEO_SECONDS.grow / 2).f), seasonOf((SEASONS.winter + (2 + SEASONS.summer - SEASONS.winter) / 2) % 1))
  assert.ok(videoMoment(5).year < videoMoment(8).year)
})
