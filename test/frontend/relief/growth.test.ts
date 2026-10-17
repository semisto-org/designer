import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GRAFT_CROWN, GRAFT_TRUNK, MANAGED_MATURITY, MANAGED_SIZE, PLANTING_SIZE, VIGOR_SIZE, calendarYear, graftOf, growthShare, insideRing, managedSize, plantForm, plantShade, plantShape, scatter, scenePlants, sizeAt, trainingOf, yearsBetween,
  type GrowingPlantsData, type GrowthInputs, type ScenePlant,
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
      { ...inputs(), id: 1, lng, lat, number: 3, ownName: null, training: null, plantedOn: '2026-06-01' },
      { ...inputs({ speciesId: 2, strata: 'canopy', plantType: 'tree' }), id: 2, lng, lat, number: null, ownName: null, training: 'pollard', plantedOn: null },
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
  assert.equal(plants[1].training, 'pollard')
  assert.equal(first.training, 'free')
  // Ten currants in the patch, one of which is the point already placed in it.
  const fromPatch = plants.filter((p) => p.patch)
  assert.equal(fromPatch.length, 9)
  assert.ok(fromPatch.every((p) => p.x >= 0 && p.x <= 20 && p.y >= 0 && p.y <= 20))
})

test('a plant casts its volume onto the heights the sun reads, from the year it is planted', () => {
  const cols = 21
  const rows = 21
  const base = new Float32Array(cols * rows).fill(100)
  const oak: ScenePlant = {
    x: 10, y: 10, form: 'tree', strata: 'canopy', heightM: 12, spreadM: 8, maturityYears: 15, training: 'free',
    start: 2, plant: 0, patch: null, seed: 1,
  }
  const altitudes = Float32Array.of(100)
  const before = plantShade(base, cols, rows, 1, [oak], altitudes, 1)
  assert.equal(before.count, 0)
  assert.deepEqual(before.heights, base)

  const adult = plantShade(base, cols, rows, 1, [oak], altitudes, 40)
  assert.equal(adult.count, 1)
  const centre = 10 * cols + 10
  assert.ok(Math.abs(adult.heights[centre] - 112) < 0.01, `${adult.heights[centre]}`)
  // Lower towards the edge of the crown, untouched beyond it.
  assert.ok(adult.heights[10 * cols + 13] > 100 && adult.heights[10 * cols + 13] < 112)
  assert.equal(adult.heights[10 * cols + 15], 100)
  assert.equal(adult.cover[centre], 1)
  assert.equal(adult.cover[10 * cols + 15], 0)
  // The base is left as it was.
  assert.equal(base[centre], 100)
})

test('a perennial raises the heights but leaves the ground under it in the light', () => {
  const base = new Float32Array(9).fill(0)
  const clump: ScenePlant = {
    x: 1, y: 1, form: 'clump', strata: 'herbaceous', heightM: 0.6, spreadM: 2, maturityYears: 2, training: 'free',
    start: 0, plant: 0, patch: null, seed: 1,
  }
  const shade = plantShade(base, 3, 3, 1, [clump], Float32Array.of(0), 10)
  assert.ok(Math.abs(shade.heights[4] - 0.6) < 0.01)
  assert.equal(shade.cover[4], 0)
})

test('a crown takes the shape its 3D model has', () => {
  const tree = plantShape('tree', 'canopy', 10, 6)
  assert.equal(tree.kind, 'crown')
  if (tree.kind === 'crown') assert.ok(Math.abs(tree.centre + tree.half - 10) < 1e-9 && tree.radius === 3)
  assert.equal(plantShape('climber', 'vine', 8, 2).height, 2.5)
})

test('a pollard or a coppice stays smaller than the same tree left free, at every age', () => {
  const oak = { strata: 'canopy' as const, heightM: 20, spreadM: 14, maturityYears: 25 }
  const pollard = { ...oak, training: 'pollard' as const }
  const coppice = { ...oak, training: 'coppice' as const }
  assert.deepEqual(managedSize(oak), { height: 20, spread: 14, maturityYears: 25 })
  assert.deepEqual(managedSize(pollard), { ...MANAGED_SIZE.pollard, maturityYears: MANAGED_MATURITY })
  assert.deepEqual(managedSize(coppice), { ...MANAGED_SIZE.coppice, maturityYears: MANAGED_MATURITY })
  // Planted the same size, they part ways as the tree grows.
  assert.deepEqual(sizeAt(pollard, 0), sizeAt(oak, 0))
  for (const age of [5, 10, 20]) {
    assert.ok(sizeAt(pollard, age)!.height < sizeAt(oak, age)!.height)
    assert.ok(sizeAt(coppice, age)!.spread <= sizeAt(oak, age)!.spread)
  }
  // A hazel smaller than the cap keeps its own size.
  const hazel = { strata: 'shrub' as const, heightM: 4, spreadM: 3, maturityYears: 8, training: 'coppice' as const }
  assert.deepEqual(managedSize(hazel), { height: 4, spread: 3, maturityYears: 8 })
  // Its shoots fill the size between two cuts sooner than the free tree grows.
  assert.ok(sizeAt(coppice, 10)!.height > 0.9 * MANAGED_SIZE.coppice.height)
})

test('a pollard stands on a short trunk, a coppice rests on the ground', () => {
  const pollard = plantShape('tree', 'canopy', 5.5, 4, 'pollard')
  assert.equal(pollard.kind, 'crown')
  if (pollard.kind === 'crown') {
    assert.equal(pollard.trunk, 2)
    assert.ok(Math.abs(pollard.centre + pollard.half - 5.5) < 1e-9)
  }
  const coppice = plantShape('tree', 'canopy', 5, 4, 'coppice')
  assert.equal(coppice.kind, 'crown')
  if (coppice.kind === 'crown') {
    assert.equal(coppice.trunk, 0)
    assert.ok(Math.abs(coppice.centre + coppice.half - 5) < 1e-9)
  }
  // A young pollard is mostly its stem: the head is not above the tree.
  const young = plantShape('tree', 'canopy', 1.6, 0.5, 'pollard')
  if (young.kind === 'crown') assert.ok(young.trunk < 1.6)
})

test('only trees and bushes take a training; anything else is free', () => {
  assert.equal(trainingOf('tree', 'pollard'), 'pollard')
  assert.equal(trainingOf('bush', 'coppice'), 'coppice')
  assert.equal(trainingOf('clump', 'coppice'), 'free')
  assert.equal(trainingOf('tree', 'espalier'), 'free')
  assert.equal(trainingOf('tree', null), 'free')
  // A climber or a perennial keeps its own shape whatever it is told.
  assert.equal(plantShape('climber', 'vine', 8, 2, 'pollard').kind, 'column')
})

test('a grafted fruit tree: its form gives a trunk and a rootstock, what the sheet says wins', () => {
  const none = { form: null, trunkHeight: null, vigor: null, rootstock: null }
  assert.equal(graftOf('tree', none), null)
  assert.equal(graftOf('tree', null), null)
  // Only a tree stands on a trunk.
  assert.equal(graftOf('bush', { ...none, form: 'standard' }), null)
  assert.deepEqual(graftOf('tree', { ...none, form: 'standard' }), { trunk: GRAFT_TRUNK.standard, vigor: 'vigorous' })
  assert.deepEqual(graftOf('tree', { ...none, form: 'bush' }), { trunk: 0.6, vigor: 'semi_dwarf' })
  assert.deepEqual(graftOf('tree', { ...none, form: 'half_standard', trunkHeight: 1.25, vigor: 'semi_dwarf' }), { trunk: 1.25, vigor: 'semi_dwarf' })
  // A vigour alone, or a trunk alone, is enough to say the tree is grafted.
  assert.deepEqual(graftOf('tree', { ...none, vigor: 'dwarf' }), { trunk: 0.6, vigor: 'dwarf' })
  assert.deepEqual(graftOf('tree', { ...none, trunkHeight: 2.1 }), { trunk: 2.1, vigor: 'vigorous' })
  // Unknown values are ignored, out-of-range trunks brought back.
  assert.equal(graftOf('tree', { ...none, form: 'espalier', vigor: 'huge' }), null)
  assert.equal(graftOf('tree', { ...none, trunkHeight: 9 })!.trunk, 3)
})

test('a grafted tree is planted with its trunk formed, and only its crown grows, to the size its rootstock allows', () => {
  const tree = { strata: 'sub_canopy' as const, heightM: 8, spreadM: 7, maturityYears: 15, training: 'free' as const }
  const standard = { ...tree, graft: { trunk: 1.8, vigor: 'vigorous' as const } }
  const bush = { ...tree, graft: { trunk: 0.6, vigor: 'dwarf' as const } }
  // On a vigorous rootstock, the species' own size; on M9, much smaller and sooner.
  assert.deepEqual(managedSize(standard), { height: 8, spread: 7, maturityYears: 15 })
  assert.deepEqual(managedSize(bush), { ...VIGOR_SIZE.dwarf })
  // Year 0: already as tall as its trunk, unlike a seedling.
  assert.ok(sizeAt(standard, 0)!.height > 1.8)
  assert.ok(sizeAt(standard, 0)!.height > sizeAt(tree, 0)!.height)
  for (const age of [0, 3, 10, 20]) {
    const shape = plantShape('tree', 'sub_canopy', sizeAt(standard, age)!.height, sizeAt(standard, age)!.spread, 'free', 1.8)
    assert.equal(shape.kind, 'crown')
    // The trunk does not grow: the first branches stay at 1.80 m.
    if (shape.kind === 'crown') assert.equal(shape.trunk, 1.8)
  }
  assert.ok(sizeAt(bush, 5)!.height > 0.9 * VIGOR_SIZE.dwarf.height)
  // A standard on a dwarfing rootstock still carries a crown above its trunk.
  assert.ok(managedSize({ ...tree, graft: { trunk: 2.5, vigor: 'very_dwarf' } }).height >= 2.5 + GRAFT_CROWN)
  // A pollard is a pollard, whatever it was grafted on.
  assert.deepEqual(managedSize({ ...standard, training: 'pollard' }).height, Math.min(8, MANAGED_SIZE.pollard.height))
})

test('scene plants: a grafted tree takes its graft, unless it is pollarded', () => {
  const [lng, lat] = lngLat(525_000 + 15, 6_590_000 - 15)
  const graft = { form: 'standard', trunkHeight: null, vigor: null, rootstock: 'MM111' }
  const data: GrowingPlantsData = {
    today: '2028-06-01',
    origin: '2026-06-01',
    plants: [
      { ...inputs({ strata: 'sub_canopy', plantType: 'tree' }), id: 1, lng, lat, number: null, ownName: null, training: null, graft, plantedOn: null },
      { ...inputs({ strata: 'sub_canopy', plantType: 'tree' }), id: 2, lng, lat, number: null, ownName: null, training: 'pollard', graft, plantedOn: null },
    ],
    patches: [],
  }
  const [grafted, pollard] = scenePlants(meta, data)
  assert.deepEqual(grafted.graft, { trunk: 1.8, vigor: 'vigorous' })
  assert.equal(pollard.graft, null)
})
