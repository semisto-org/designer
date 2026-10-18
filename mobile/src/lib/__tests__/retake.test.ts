import { elapsed, guide, photosHere, seriesOf } from '../retake'
import type { Photo } from '../types'

const photo = (id: number, extra: Partial<Photo> = {}): Photo => ({
  id, kind: 'photo', caption: null, takenAt: '2026-10-18T10:00:00Z', lng: 4.95, lat: 50.32, featureId: null, uploadedBy: null, ...extra,
})

describe('photo retaken from the same spot', () => {
  const first = photo(1, { takenAt: '2024-10-18T10:00:00Z', heading: 90 })
  const second = photo(5, { takenAt: '2025-10-20T10:00:00Z', retakeOfId: 1, lng: 4.9501 })
  const third = photo(9, { takenAt: '2026-10-18T10:00:00Z', retakeOfId: 1, lng: null, lat: null })
  const elsewhere = photo(3, { lng: 4.96, takenAt: '2026-01-01T10:00:00Z' })
  const video = photo(4, { kind: 'video', retakeOfId: 1 })
  const all = [third, elsewhere, first, video, second]

  it('gathers a series, oldest first, without videos', () => {
    expect(seriesOf(all, third).map((p) => p.id)).toEqual([1, 5, 9])
    expect(seriesOf(all, first).map((p) => p.id)).toEqual([1, 5, 9])
    expect(seriesOf(all, elsewhere).map((p) => p.id)).toEqual([3])
  })

  it('says how long after, in the words of a gardener', () => {
    expect(elapsed('2026-10-18T10:00:00Z', '2026-10-18T15:00:00Z')).toBe('le même jour')
    expect(elapsed('2026-10-01T10:00:00Z', '2026-10-18T10:00:00Z')).toBe('17 jours plus tard')
    expect(elapsed('2026-04-18T10:00:00Z', '2026-10-18T10:00:00Z')).toBe('6 mois plus tard')
    expect(elapsed('2025-10-18T10:00:00Z', '2026-10-18T10:00:00Z')).toBe('1 an plus tard')
    expect(elapsed('2024-04-10T10:00:00Z', '2025-10-18T10:00:00Z')).toBe('1 an et demi plus tard')
    expect(elapsed('2023-10-18T10:00:00Z', '2026-10-20T10:00:00Z')).toBe('3 ans plus tard')
    expect(elapsed(null, '2026-10-18T10:00:00Z')).toBeNull()
  })

  it('brings the person to the spot, then turns them the same way', () => {
    const tenMetersWest: [number, number] = [4.95 - 0.00014, 50.32]
    const walk = guide(first, tenMetersWest, 4, 0)
    expect(walk.step).toBe('walk')
    if (walk.step === 'walk') {
      expect(walk.direction).toBe('E')
      expect(walk.meters).toBeCloseTo(10, 0)
    }
    expect(guide(first, [4.95, 50.32], 4, 20)).toEqual({ step: 'turn', degrees: 70 })
    expect(guide(first, [4.95, 50.32], 4, 160)).toEqual({ step: 'turn', degrees: -70 })
    expect(guide(first, [4.95, 50.32], 4, 85)).toEqual({ step: 'ready' })
    expect(guide(first, [4.95, 50.32], 4, null)).toEqual({ step: 'ready' })
    expect(guide(first, null, null, null)).toEqual({ step: 'locating' })
    expect(guide(photo(2, { lng: null, lat: null }), [4.95, 50.32], 4, 0)).toEqual({ step: 'free' })
  })

  it('lists what was photographed around, one per series, its latest', () => {
    const here = photosHere(all, [4.95, 50.32])
    expect(here.map((h) => [h.photo.id, h.count])).toEqual([[9, 3]])
    expect(photosHere(all, [4.96, 50.32]).map((h) => h.photo.id)).toEqual([3])
  })
})
