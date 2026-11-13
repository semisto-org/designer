import { catalogueOnly, cleanVariety, pastYears, plantingProperties, varietySuggestions } from '../fieldPlanting'

const apple = { id: 1, latinName: 'Malus domestica', commonName: 'Pommier', strata: 'tree' }
const pear = { id: 2, latinName: 'Pyrus communis', commonName: 'Poirier', strata: 'tree' }

describe('planting from the land', () => {
  it('writes the planting date the way the website does', () => {
    expect(plantingProperties({ type: 'planned' }, '2026-11-13')).toEqual({})
    expect(plantingProperties({ type: 'today' }, '2026-11-13')).toEqual({ planted_on: '2026-11-13' })
    expect(plantingProperties({ type: 'year', year: 2024 }, '2026-11-13')).toEqual({ planted_on: '2024-01-01', planted_on_precision: 'year' })
    expect(plantingProperties({ type: 'unknown' }, '2026-11-13')).toEqual({ planted_on: '2026-11-13', planted_on_precision: 'unknown' })
  })

  it('offers this year and the three before', () => {
    expect(pastYears('2026-11-13')).toEqual([2026, 2025, 2024, 2023])
  })

  it('shows from the catalogue only what the map does not already offer', () => {
    expect(catalogueOnly([apple, pear], [apple]).map((sp) => sp.id)).toEqual([2])
  })

  it('suggests the map cultivars first, without twins, matching what is typed', () => {
    const planting = { varieties: { '5': { id: 5, speciesId: 1, name: 'Reinette grise' }, '6': { id: 6, speciesId: 2, name: 'Conférence' } } }
    const catalogue = [{ name: 'reinette grise' }, { name: 'Belle de Boskoop' }]
    expect(varietySuggestions(1, planting, catalogue, '')).toEqual(['Reinette grise', 'Belle de Boskoop'])
    expect(varietySuggestions(1, planting, catalogue, "'bos")).toEqual(['Belle de Boskoop'])
  })

  it('reads the cultivar without the label quotes', () => {
    expect(cleanVariety("  'Reinette   grise' ")).toBe('Reinette grise')
    expect(cleanVariety('« Comice »')).toBe('Comice')
  })
})
