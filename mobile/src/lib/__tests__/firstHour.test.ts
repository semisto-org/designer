import { firstHourMissions } from '../firstHour'
import type { FirstHour, MapFeature } from '../types'

const feature = (id: number, properties: Record<string, unknown>): MapFeature =>
  ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [0, 0] }, properties: { layer: 'notes', status: 'active', ...properties } } as MapFeature)

const server = (overrides: Partial<FirstHour> = {}): FirstHour => ({
  shown: true, done: false, signs: ['first_frost'],
  missions: [
    { key: 'water', done: false, count: 0 },
    { key: 'season', done: false, count: 0 },
    { key: 'living', done: false, count: 1, target: 3 },
  ],
  ...overrides,
})

describe('Ta première heure', () => {
  it('shows nothing when the server does not show the missions', () => {
    expect(firstHourMissions(null, [])).toBeNull()
    expect(firstHourMissions(server({ shown: false }), [])).toBeNull()
  })

  it('ticks water and season from what was noted on the phone', () => {
    const result = firstHourMissions(server(), [
      feature(1, { kind: 'season_sign', sign: 'puddle' }),
      feature(2, { kind: 'season_sign', sign: 'frost_pocket' }),
    ])!
    expect(result.missions.map((m) => [m.key, m.done])).toEqual([['water', true], ['season', true], ['living', false]])
    expect(result.done).toBe(false)
  })

  it('counts a downpour as water, never a draft', () => {
    const result = firstHourMissions(server(), [
      feature(1, { kind: 'storm_observation' }),
      feature(2, { kind: 'season_sign', sign: 'nest', status: 'draft' }),
    ])!
    expect(result.missions[0]).toMatchObject({ done: true, count: 1 })
    expect(result.missions[1]).toMatchObject({ done: false, count: 0 })
  })

  it('keeps the plants as the server counted them', () => {
    const result = firstHourMissions(server({ missions: [
      { key: 'water', done: true, count: 2 }, { key: 'season', done: true, count: 1 }, { key: 'living', done: true, count: 3, target: 3 },
    ] }), [])!
    expect(result.done).toBe(true)
    expect(result.missions[2].count).toBe(3)
  })
})
