import { SIGNS, SIGN_KEYS, missingSeasons, observationYear, observedOn, signFeature, signsOfMonth, signsToLookFor } from '../season'
import type { MapFeature } from '../types'

const feature = (id: number, properties: Record<string, unknown>): MapFeature =>
  ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [0, 0] }, properties: { layer: 'notes', kind: 'season_sign', status: 'active', ...properties } } as MapFeature)

const now = new Date(2026, 9, 19, 12)

describe('Le carnet des saisons', () => {
  it('gives every sign at least one month, all real months', () => {
    for (const sign of SIGN_KEYS) {
      expect(SIGNS[sign].months.length).toBeGreaterThan(0)
      for (const month of SIGNS[sign].months) expect(month).toBeGreaterThanOrEqual(1)
      for (const month of SIGNS[sign].months) expect(month).toBeLessThanOrEqual(12)
    }
    // Every month sends the person out for something.
    for (let month = 0; month < 12; month++) expect(signsOfMonth(new Date(2026, month, 15)).length).toBeGreaterThanOrEqual(2)
  })

  it('makes a note of the sign where one stands', () => {
    const made = signFeature({ sign: 'first_frost', label: 'Premier gel', text: '  givre sur la prairie ', position: [4.9, 50.3], observedAt: '2026-10-19T07:00:00Z', accuracy: { gps_accuracy_m: 4 } })
    expect(made).toEqual({
      layer: 'notes', kind: 'season_sign', name: 'Premier gel', notes: 'givre sur la prairie',
      properties: { sign: 'first_frost', observed_at: '2026-10-19T07:00:00Z', gps_accuracy_m: 4 },
      geometry: { type: 'Point', coordinates: [4.9, 50.3] },
    })
    expect(signFeature({ sign: 'nest', label: 'Un nid', text: ' ', position: [0, 0], observedAt: 'x' }).notes).toBeNull()
  })

  it('dates a sign seen today now, and one seen earlier in that morning', () => {
    expect(observedOn(0, now)).toBe(now.toISOString())
    expect(observedOn(1, now)).toBe('2026-10-18T08:00:00.000Z')
  })

  it('counts a year of observation by season, current season first', () => {
    const year = observationYear([
      feature(1, { sign: 'first_frost', observed_at: '2026-10-10T07:00:00Z' }),
      feature(2, { kind: 'storm_observation', layer: 'water', observed_at: '2026-02-03T15:00:00Z' }),
      feature(3, { kind: 'note_point', visit: 'abc', taken_at: '2026-05-02T10:00:00Z' }),
      // Not an observation: a note outside a visit, a draft, a sign older than a year.
      feature(4, { kind: 'note_point', taken_at: '2026-07-02T10:00:00Z' }),
      feature(5, { sign: 'nest', observed_at: '2026-07-02T10:00:00Z', status: 'draft' }),
      feature(6, { sign: 'nest', observed_at: '2025-07-02T10:00:00Z' }),
    ], now)
    expect(year).toEqual([
      { season: 'autumn', count: 1 }, { season: 'winter', count: 1 }, { season: 'spring', count: 1 }, { season: 'summer', count: 0 },
    ])
    expect(missingSeasons(year)).toEqual(['summer'])
  })

  it('names this month’s signs, the ones not yet noted this season first', () => {
    expect(signsToLookFor([], now).map((s) => s.sign)).toEqual(['first_frost', 'morning_mist', 'puddle'])
    const noted = signsToLookFor([feature(1, { sign: 'first_frost', observed_at: '2026-10-12T07:00:00Z' })], now, 10)
    expect(noted.at(-1)).toEqual({ sign: 'first_frost', noted: true })
    expect(noted[0].noted).toBe(false)
    // A frost of last autumn does not count for this one.
    expect(signsToLookFor([feature(1, { sign: 'first_frost', observed_at: '2025-10-12T07:00:00Z' })], now)[0]).toEqual({ sign: 'first_frost', noted: false })
  })
})
