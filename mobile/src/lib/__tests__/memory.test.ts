import { memoryOf } from '../memory'
import type { MapFeature, Photo } from '../types'

const photo = (id: number, takenAt: string | null): Photo =>
  ({ id, takenAt, caption: null, lng: null, lat: null, featureId: null, uploadedBy: null })
const feature = (id: number, properties: Record<string, unknown>): MapFeature =>
  ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [0, 0] }, properties: { layer: 'plants', kind: 'plant', status: 'active', ...properties } } as MapFeature)

const today = new Date(2026, 9, 19)

describe('« Il y a un an, ici »', () => {
  it('finds what happened around this date a year ago, closest day first', () => {
    const memory = memoryOf({
      today,
      photos: [photo(1, '2025-10-25T10:00:00Z'), photo(2, '2025-10-19T09:00:00Z'), photo(3, '2025-11-10T09:00:00Z'), photo(4, null)],
      features: [feature(10, { planted_on: '2025-10-18' }), feature(11, { layer: 'water', kind: 'pond', built_on: '2025-10-15' })],
    })
    expect(memory).toMatchObject({ yearsAgo: 1, date: '2025-10-19' })
    expect(memory!.photos.map((p) => p.id)).toEqual([2, 1])
    expect(memory!.planted.map((f) => f.id)).toEqual([10])
    expect(memory!.built.map((f) => f.id)).toEqual([11])
  })

  it('goes back further when last year was quiet, and prefers the latest year', () => {
    expect(memoryOf({ today, photos: [photo(1, '2023-10-20T10:00:00Z')], features: [] })).toMatchObject({ yearsAgo: 3 })
    expect(memoryOf({ today, photos: [photo(1, '2023-10-20T10:00:00Z'), photo(2, '2024-10-17T10:00:00Z')], features: [] })!.photos.map((p) => p.id)).toEqual([2])
  })

  it('crosses the new year, and leaves out this year, drafts and unknown planting days', () => {
    expect(memoryOf({ today: new Date(2026, 0, 3), photos: [photo(1, '2024-12-30T10:00:00Z')], features: [] })).toMatchObject({ yearsAgo: 1, date: '2025-01-03' })
    expect(memoryOf({
      today,
      photos: [photo(1, '2026-10-12T10:00:00Z')],
      features: [feature(1, { planted_on: '2025-10-19', status: 'draft' }), feature(2, { planted_on: '2025-10-19', planted_on_precision: 'unknown' })],
    })).toBeNull()
  })

  it('takes 29 February to the 28th', () => {
    expect(memoryOf({ today: new Date(2028, 1, 29), photos: [photo(1, '2027-02-28T10:00:00Z')], features: [] })).toMatchObject({ yearsAgo: 1, date: '2027-02-28' })
  })
})
