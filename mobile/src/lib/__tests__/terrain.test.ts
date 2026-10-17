import { ageLabel, around, compass, monthCard, plantedAge } from '../terrain'
import type { MapFeature } from '../types'

const me: [number, number] = [4.95, 50.32]
const plant = (id: number, coordinates: [number, number], extra: Partial<MapFeature['properties']> = {}): MapFeature => ({
  type: 'Feature', id, geometry: { type: 'Point', coordinates },
  properties: { id, layer: 'plants', kind: 'plant', name: null, notes: null, status: 'active', lockVersion: 0, ...extra },
})

describe('terrain', () => {
  it('names the compass direction in French points', () => {
    expect(compass(0)).toBe('N')
    expect(compass(44)).toBe('NE')
    expect(compass(180)).toBe('S')
    expect(compass(270)).toBe('O')
    expect(compass(350)).toBe('N')
  })

  it('lists what stands around the person, nearest first, within the radius', () => {
    const features = [
      plant(1, [4.95, 50.32 + 0.0002]), // ~22 m north
      plant(2, [4.95 + 0.0001, 50.32]), // ~7 m east
      plant(3, [4.95, 50.33]), // ~1.1 km
      plant(4, [4.95, 50.32 + 0.00005], { status: 'rejected' }),
    ]
    const list = around(features, me, { radius: 30 })
    expect(list.map((item) => item.feature.id)).toEqual([2, 1])
    expect(list[0].direction).toBe('E')
    expect(list[0].meters).toBeCloseTo(7.1, 0)
    expect(list[1].direction).toBe('N')
  })

  it('counts a plant’s age in days, months, then winters', () => {
    const now = new Date(2026, 9, 17)
    expect(plantedAge(null, now)).toBeNull()
    expect(plantedAge('2026-10-17', now)).toEqual({ unit: 'today' })
    expect(plantedAge('2026-10-16', now)).toEqual({ unit: 'days', count: 1 })
    expect(plantedAge('2026-03-02', now)).toEqual({ unit: 'months', count: 7 })
    // Planted in November 2025: one winter (January 2026) behind it.
    expect(plantedAge('2025-11-20', now)).toEqual({ unit: 'winters', count: 1 })
    expect(plantedAge('2024-02-01', now)).toEqual({ unit: 'winters', count: 2 })
    expect(plantedAge('2026-01-15T10:00:00Z', now)).toEqual({ unit: 'months', count: 9 })
  })

  it('writes the age as a gardener would', () => {
    expect(ageLabel({ unit: 'today' })).toBe("planté aujourd'hui")
    expect(ageLabel({ unit: 'days', count: 1 })).toBe('planté hier')
    expect(ageLabel({ unit: 'winters', count: 1 })).toBe('a passé son premier hiver ici')
    expect(ageLabel({ unit: 'winters', count: 3 })).toBe('a passé 3 hivers ici')
  })

  it('gives the help center’s card of the month', () => {
    expect(monthCard(new Date(2026, 0, 10))?.title).toMatch(/^Janvier/)
    expect(monthCard(new Date(2026, 9, 17))?.body).toBeTruthy()
  })
})
