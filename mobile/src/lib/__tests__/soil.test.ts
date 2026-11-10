import { metersTo, nearestFirst, photosOf } from '../soil'
import type { Photo, SoilSample } from '../types'

const point = (id: number, lng: number | null, lat: number | null): SoilSample => ({
  id, label: `P${id}`, lng, lat, status: 'planned', depthFromCm: 0, depthToCm: 20, sampledOn: null,
})

describe('soil sampling points', () => {
  const samples = [point(1, 4.91, 50.34), point(2, null, null), point(3, 4.9001, 50.34)]

  it('puts the nearest point first and the unplaced last, or keeps the order without a position', () => {
    expect(nearestFirst(samples, [4.9, 50.34]).map((s) => s.id)).toEqual([3, 1, 2])
    expect(nearestFirst(samples, null).map((s) => s.id)).toEqual([1, 2, 3])
    expect(Math.round(metersTo([4.9, 50.34], samples[2]) ?? 0)).toBe(7)
    expect(metersTo([4.9, 50.34], samples[1])).toBeNull()
  })

  it('finds the photos of a point', () => {
    const photos = [{ id: 10, soilSampleId: 3 }, { id: 11, soilSampleId: null }, { id: 12 }] as Photo[]
    expect(photosOf(photos, samples[2]).map((p) => p.id)).toEqual([10])
  })
})
