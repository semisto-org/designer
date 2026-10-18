import { adviceLines, amountsFor, harvestBody, isHarvestable, nextTree, nothingHarvest } from '../harvests'
import type { MapBundle, MapFeature } from '../types'

const species = {
  '1': { id: 1, latinName: 'Malus domestica', commonName: 'Pommier', strata: 'sub_canopy' },
  '2': { id: 2, latinName: 'Symphytum officinale', commonName: 'Consoude', strata: 'herbaceous' },
}

function plant(id: number, lng: number, speciesId = 1, plantedOn: string | null = '2020-11-20'): MapFeature {
  return {
    type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, 50.34] },
    properties: { id, layer: 'plants', kind: 'plant', name: null, notes: null, status: 'active', lockVersion: 0, species_id: speciesId, ...(plantedOn ? { planted_on: plantedOn } : {}) },
  } as MapFeature
}

const bundle = { features: [plant(1, 4.9), plant(2, 4.9001), plant(3, 4.9002), plant(4, 4.90005, 2), plant(5, 4.90001, 1, null)], planting: { species, palette: [] } } as unknown as MapBundle

describe('harvests', () => {
  it('applies to trees and shrubs, not herbs', () => {
    expect(isHarvestable(bundle.features[0], bundle.planting)).toBe(true)
    expect(isHarvestable(bundle.features[3], bundle.planting)).toBe(false)
  })

  it('leaves out a tree still to plant', () => {
    expect(isHarvestable(bundle.features[4], bundle.planting)).toBe(false)
  })

  it('never offers « no fruit » for a harvest', () => {
    expect(amountsFor('picked')).toEqual(['light', 'normal', 'heavy'])
    expect(amountsFor('on_tree')).toContain('none')
  })

  it('notes « no fruit » in one go, as a look at an empty tree', () => {
    expect(harvestBody(nothingHarvest('2026-10-18')).plant_harvest).toMatchObject({ noted_on: '2026-10-18', stage: 'on_tree', amount: 'none', uses: [], quantity_kg: null, note: null })
  })

  it('sends uses and weight only with a harvest', () => {
    const body = harvestBody({ notedOn: '2026-07-01', stage: 'on_tree', amount: 'heavy', uses: ['juice'], quantityKg: 3, note: null })
    expect(body.plant_harvest).toMatchObject({ stage: 'on_tree', uses: [], quantity_kg: null })
  })

  it('goes on to the closest tree not noted yet, skipping herbs', () => {
    expect(nextTree(bundle, bundle.features[0], new Set([1]))?.feature.id).toBe(2)
    expect(nextTree(bundle, bundle.features[0], new Set([1, 2]))?.feature.id).toBe(3)
    expect(nextTree(bundle, bundle.features[0], new Set([1, 2, 3]))).toBeNull()
  })
})

describe('adviceLines', () => {
  const t = (key: string, vars: Record<string, string | number> = {}) => `${key}${Object.keys(vars).length ? JSON.stringify(vars) : ''}`
  const here = { picked: 0, uses: {}, notes: [] }

  it('says the plant needs a variety first', () => {
    expect(adviceLines({ variety: null, keeping: null, ripensInStore: false, here }, t)[0]).toBe('plant_harvests.advice.no_variety')
  })

  it('turns a keeping variety into a cellar suggestion, with its season', () => {
    const lines = adviceLines({
      variety: { name: 'Reinette de France', uses: ['fresh', 'cooking'], pickingMonth: 10, eatingFromMonth: 12, eatingUntilMonth: 3 },
      keeping: 'keeps', ripensInStore: true, here: { picked: 2, uses: { juice: 2 }, notes: [{ plant: 'n° 80', notedOn: '2026-10-12', note: 'Belle année' }] },
    }, t)
    expect(lines).toContain('plant_harvests.advice.keeping.keeps{"until":"plant_harvests.months.3"}')
    expect(lines.some((l) => l.startsWith('plant_harvests.advice.ripens_in_store'))).toBe(true)
    expect(lines.some((l) => l.startsWith('plant_harvests.advice.here_uses'))).toBe(true)
    expect(lines.at(-1)).toBe('« Belle année » — n° 80')
  })
})
