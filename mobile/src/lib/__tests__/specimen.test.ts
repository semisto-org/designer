import { inWinter, STRATA_PLATES, wintersInGround } from '../specimen'

describe('La page spécimen', () => {
  it('counts the winters a plant has spent in the ground', () => {
    expect(wintersInGround('2024-11-28', null, '2026-11-21')).toBe(2)
    expect(wintersInGround('2026-03-10', null, '2026-11-21')).toBe(0)
    expect(wintersInGround('2024-06-01', 'unknown', '2026-11-21')).toBeNull()
    expect(inWinter('2027-01-10')).toBe(true)
  })

  it('has a plate for each strata', () => {
    expect(Object.keys(STRATA_PLATES).sort()).toEqual(['aquatic', 'canopy', 'ground_cover', 'herbaceous', 'root', 'shrub', 'sub_canopy', 'vine'])
  })
})
