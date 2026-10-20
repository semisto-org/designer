import { pointIcon, STRATA_COLORS, strataColor, PLANTED_COLOR } from '../elements'
import type { MapFeature, Planting } from '../types'

const feature = (properties: Record<string, unknown>): MapFeature =>
  ({ id: 1, geometry: { type: 'Point', coordinates: [4.9, 50.3] }, properties: { layer: 'notes', kind: 'note_point', ...properties } }) as unknown as MapFeature

describe('pointIcon', () => {
  it('says what an observation saw, else takes the kind\'s icon, else a pin', () => {
    expect(pointIcon(feature({ realm: 'fauna' }))).toBe('paw-print')
    expect(pointIcon(feature({ realm: 'flora' }))).toBe('flower-2')
    expect(pointIcon(feature({ agronomy: 'balanced' }))).toBe('sprout')
    expect(pointIcon(feature({}))).toBe('sticky-note')
    expect(pointIcon(feature({ kind: 'season_sign' }))).toBe('calendar-days')
    expect(pointIcon(feature({ layer: 'existing', kind: 'nothing_known' }))).toBe('map-pin')
  })
})

describe('strataColor', () => {
  const planting = { species: { '7': { id: 7, latinName: 'Malus domestica', commonName: 'Pommier', strata: 'sub_canopy' } } } as unknown as Planting
  it('colours a plant by its strata, else the planted green', () => {
    expect(strataColor(feature({ layer: 'plants', kind: 'plant', species_id: 7 }), planting)).toBe(STRATA_COLORS.sub_canopy)
    expect(strataColor(feature({ layer: 'plants', kind: 'plant', species_id: 99 }), planting)).toBe(PLANTED_COLOR)
  })
})
