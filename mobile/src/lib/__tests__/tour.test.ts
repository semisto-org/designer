import { arrived, arrowAngle, lastCheck, nextTarget, remaining, takeDue } from '../tour'
import type { Op } from '../outbox-core'
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

describe('take round', () => {
  const round = {
    since: '2026-03-01', open: true,
    due: [{ id: 1, lastObservedOn: '2025-04-20', lastSurvival: 'struggling' as const }, { id: 2, lastObservedOn: null, lastSurvival: null }, { id: 9, lastObservedOn: null, lastSurvival: null }],
  }
  const features = [plant(1, [4.95, 50.32 + 0.0002], { planted_on: '2024-11-10' }), plant(2, [4.95 + 0.0001, 50.32], { planted_on: '2025-11-20' })]
  const checked = (featureId: number, observedOn: string, kind?: 'follow_up' | 'pruning'): Op =>
    ({ id: `o${featureId}`, mapId: 1, createdAt: observedOn, type: 'createObservation', featureId, observedOn, kind, survival: 'established', vigor: null, note: null, photo: null })

  it('leads to the plants the server listed, still on the map and not checked on this phone since', () => {
    expect([...takeDue(round, features, [])]).toEqual([1, 2])
    expect([...takeDue(round, features, [checked(2, '2026-04-02')])]).toEqual([1])
    // Pruning says nothing about the take; a check from last year doesn't count this spring.
    expect([...takeDue(round, features, [checked(2, '2026-04-02', 'pruning'), checked(1, '2025-05-01')])]).toEqual([1, 2])
    expect(takeDue(undefined, features, []).size).toBe(0)
  })

  it('walks to the nearest one due, and remembers what it said last spring', () => {
    const due = takeDue(round, features, [])
    expect(nextTarget(features, me, new Set(), (f) => due.has(f.id))!.feature.id).toBe(2)
    expect(lastCheck(round, 1)?.lastSurvival).toBe('struggling')
    expect(lastCheck(round, 5)).toBeNull()
  })
})
