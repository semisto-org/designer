import { featureTitle, inkOn, pointIcon, STRATA_COLORS, strataColor, PLANTED_COLOR } from '../elements'
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

describe('inkOn', () => {
  it('writes white on dark strata and ink on light ones', () => {
    expect(inkOn(STRATA_COLORS.canopy)).toBe('#ffffff')
    expect(inkOn(STRATA_COLORS.sub_canopy)).toBe('#1b1712')
    expect(inkOn(STRATA_COLORS.herbaceous)).toBe('#1b1712')
  })
})

describe('featureTitle for a season sign', () => {
  const sign = (properties: Record<string, unknown>) =>
    ({ type: 'Feature', id: 1, geometry: { type: 'Point', coordinates: [0, 0] }, properties: { layer: 'notes', kind: 'season_sign', ...properties } }) as unknown as MapFeature

  it('names the sign when nobody gave it a name', () => {
    expect(featureTitle(sign({ sign: 'snow_melts_first' }))).not.toBe(featureTitle(sign({})))
    expect(featureTitle(sign({ name: 'Bande sans neige', sign: 'snow_melts_first' }))).toBe('Bande sans neige')
  })
})
