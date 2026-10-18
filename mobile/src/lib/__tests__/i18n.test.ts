import { formatArea, formatDistance, has, seasonOf, t, todayIso } from '../i18n'

describe('i18n', () => {
  it('reads the Rails strings with %{var} and plural forms', () => {
    expect(t('mobile.terrain.waiting', { count: 1 })).toBe('1 modification en attente du réseau')
    expect(t('mobile.terrain.waiting', { count: 3 })).toBe('3 modifications en attente du réseau')
    expect(t('plant_feature.planted_on', { date: '4 octobre 2026' })).toBe('Planté le 4 octobre 2026')
    expect(t('mobile.nope')).toBe('mobile.nope')
    expect(has('plant_observations.survivals.established')).toBe(true)
  })

  it('formats distances and the local date', () => {
    expect(formatDistance(12.4)).toBe('12 m')
    expect(formatDistance(1234)).toMatch(/^1,2\s?km$/)
    expect(formatArea(470.4)).toBe('470 m²')
    expect(formatArea(12_345)).toMatch(/^1,23\s?ha$/)
    expect(todayIso(new Date(2026, 9, 4, 23, 30))).toBe('2026-10-04')
  })
})

describe('seasonOf', () => {
  it('counts winter from December, autumn from September', () => {
    expect(seasonOf(new Date(2026, 11, 1))).toBe('winter')
    expect(seasonOf(new Date(2027, 1, 28))).toBe('winter')
    expect(seasonOf(new Date(2027, 2, 1))).toBe('spring')
    expect(seasonOf(new Date(2026, 6, 14))).toBe('summer')
    expect(seasonOf(new Date(2026, 9, 17))).toBe('autumn')
  })
})
