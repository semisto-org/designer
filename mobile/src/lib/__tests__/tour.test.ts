import { arrived, arrowAngle, nextTarget, remaining } from '../tour'
import type { MapFeature } from '../types'

const me: [number, number] = [4.95, 50.32]
const plant = (id: number, coordinates: [number, number], extra: Record<string, unknown> = {}): MapFeature => ({
  type: 'Feature', id, geometry: { type: 'Point', coordinates },
  properties: { id, layer: 'plants', kind: 'plant', name: null, notes: null, status: 'active', lockVersion: 0, ...extra },
})

describe('planting round', () => {
  const features = [
    plant(1, [4.95, 50.32 + 0.0002]), // ~22 m north
    plant(2, [4.95 + 0.0001, 50.32]), // ~7 m east
    plant(3, [4.95 + 0.00002, 50.32], { planted_on: '2026-10-01' }),
    plant(4, [4.95, 50.32 + 0.00001], { status: 'draft' }),
    plant(-5, [4.95, 50.32]), // drawn offline, not yet on the server
    { ...plant(6, [4.95, 50.32]), properties: { ...plant(6, me).properties, kind: 'hedge' } },
  ]

  it('leads to the nearest plant still to plant', () => {
    const target = nextTarget(features, me)!
    expect(target.feature.id).toBe(2)
    expect(target.direction).toBe('E')
    expect(target.meters).toBeCloseTo(7.1, 0)
    expect(remaining(features)).toBe(2)
  })

  it('leaves out the skipped ones, and says when none is left', () => {
    expect(nextTarget(features, me, new Set([2]))!.feature.id).toBe(1)
    expect(nextTarget(features, me, new Set([1, 2]))).toBeNull()
  })

  it('arrives within 2 m, or within what the GPS can tell, at most 6 m', () => {
    expect(arrived(1.5, 1)).toBe(true)
    expect(arrived(3, 1)).toBe(false)
    expect(arrived(3, 4)).toBe(true)
    expect(arrived(8, 20)).toBe(false)
  })

  it('turns the arrow by the way the phone faces', () => {
    expect(arrowAngle(90, 0)).toBe(90)
    expect(arrowAngle(10, 350)).toBe(20)
    expect(arrowAngle(90, null)).toBeNull()
    expect(arrowAngle(90, -1)).toBeNull()
  })
})
