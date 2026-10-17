import { amountsFor, harvestBody, isHarvestable, nextTree } from '../harvests'
import type { MapBundle, MapFeature } from '../types'

const species = {
  '1': { id: 1, latinName: 'Malus domestica', commonName: 'Pommier', strata: 'sub_canopy' },
  '2': { id: 2, latinName: 'Symphytum officinale', commonName: 'Consoude', strata: 'herbaceous' },
}

function plant(id: number, lng: number, speciesId = 1): MapFeature {
  return {
    type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, 50.34] },
    properties: { id, layer: 'plants', kind: 'plant', name: null, notes: null, status: 'active', lockVersion: 0, species_id: speciesId },
  } as MapFeature
}

const bundle = { features: [plant(1, 4.9), plant(2, 4.9001), plant(3, 4.9002), plant(4, 4.90005, 2)], planting: { species, palette: [] } } as unknown as MapBundle

describe('harvests', () => {
  it('applies to trees and shrubs, not herbs', () => {
    expect(isHarvestable(bundle.features[0], bundle.planting)).toBe(true)
    expect(isHarvestable(bundle.features[3], bundle.planting)).toBe(false)
  })

  it('never offers « no fruit » for a harvest', () => {
    expect(amountsFor('picked')).toEqual(['light', 'normal', 'heavy'])
    expect(amountsFor('on_tree')).toContain('none')
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
