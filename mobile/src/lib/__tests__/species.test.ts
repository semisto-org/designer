import { speciesChoices } from '../species'

const species = {
  '1': { id: 1, latinName: 'Malus domestica', commonName: 'Pommier', strata: 'tree' },
  '2': { id: 2, latinName: 'Corylus avellana', commonName: 'Noisetier', strata: 'shrub' },
  '3': { id: 3, latinName: 'Ribes rubrum', commonName: 'Groseillier', strata: 'shrub' },
}

describe('speciesChoices', () => {
  it('puts the palette first, then the others by name', () => {
    const planting = { species, palette: [{ id: 9, speciesId: 3, name: 'Groseillier', latinName: 'Ribes rubrum' }] }
    expect(speciesChoices(planting, '').map((s) => s.id)).toEqual([3, 2, 1])
  })

  it('finds by common or latin name, without accents or case', () => {
    const planting = { species: { ...species, '4': { id: 4, latinName: 'Prunus cerasus', commonName: 'Cerisier acide', strata: 'tree' } }, palette: [] }
    expect(speciesChoices(planting, 'CORYL').map((s) => s.id)).toEqual([2])
    expect(speciesChoices(planting, 'cerisier acide').map((s) => s.id)).toEqual([4])
    expect(speciesChoices(planting, 'pommiér').map((s) => s.id)).toEqual([1])
  })
})
