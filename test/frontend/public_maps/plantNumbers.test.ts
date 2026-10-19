import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PublicGrowth } from '../../../app/frontend/public_maps/garden.ts'
import { plantLegend, plantNumber, plantNumbersAt } from '../../../app/frontend/public_maps/plantNumbers.ts'
import { STRATA_COLORS } from '../../../app/frontend/map/plants/strataColors.ts'

const inputs = { speciesId: 1, varietyId: null, foliage: 'deciduous', plantType: 'tree', indicative: false, latinName: 'Malus domestica', heightM: 5, spreadM: 4, maturityYears: 12 }
const plant = (id: number, number: string | number | null, extra: Record<string, unknown> = {}) => ({
  ...inputs, id, number, name: 'Pommier', strata: 'sub_canopy' as const, training: null, graft: null, lng: 4.9, lat: 50.34, plantedOn: '2025-11-20', ...extra,
})

function growth(plants: PublicGrowth['plants'], patches: PublicGrowth['patches'] = []): PublicGrowth {
  return { today: '2026-10-19', origin: '2025-11-20', plants, patches }
}

test('a number is read from the snapshot whatever its type, never zero or blank', () => {
  assert.equal(plantNumber(4), 4)
  assert.equal(plantNumber('27'), 27)
  assert.equal(plantNumber(''), null)
  assert.equal(plantNumber(null), null)
  assert.equal(plantNumber(0), null)
})

test('each plant point is a pastille in its strata colour, hollow until it goes into the ground', () => {
  const data = plantNumbersAt(growth([
    plant(1, 3),
    plant(2, null, { strata: 'shrub', name: 'Cassis' }),
    plant(3, '8', { plantedOn: '2029-03-01' }),
  ]), 1)
  const [a, b, c] = data.features.map((f) => f.properties)
  assert.deepEqual([a.number, a.color, a.planted], ['3', STRATA_COLORS.sub_canopy, true])
  assert.deepEqual([b.number, b.color], ['', STRATA_COLORS.shrub])
  assert.equal(c.planted, false, 'planted in year 3, not yet in year 1')
  assert.equal(plantNumbersAt(growth([plant(3, 8, { plantedOn: '2029-03-01' })]), 4).features[0].properties.planted, true)
  assert.equal(plantNumbersAt(growth([plant(4, 1, { plantedOn: null, plantedLongAgo: true })]), 0).features[0].properties.planted, true)
})

test('the legend lists strata from the highest down, species with their number ranges', () => {
  const legend = plantLegend(growth([
    plant(1, 5), plant(2, 3), plant(3, 4),
    plant(4, 1, { strata: 'canopy', name: 'Noyer' }),
    plant(5, null, { strata: 'shrub', name: 'Cassis' }), plant(6, null, { strata: 'shrub', name: 'Cassis' }),
  ], [{ id: 9, ring: [], lines: [{ ...inputs, name: 'Fraisier', strata: 'ground_cover', quantity: 12, shown: 12 }] }]), 'Sans espèce')
  assert.deepEqual(legend.map((g) => [g.strata, g.count]), [['canopy', 1], ['sub_canopy', 3], ['shrub', 2], ['ground_cover', 12]])
  assert.deepEqual(legend[1].species, [{ name: 'Pommier', strata: 'sub_canopy', numbers: '3–5', count: 3 }])
  assert.deepEqual(legend[2].species, [{ name: 'Cassis', strata: 'shrub', numbers: '', count: 2 }])
  assert.equal(legend[3].species[0].count, 12)
})
