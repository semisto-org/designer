import { canClose, decodePoints, encodePoints, measureGeometry, measureOf, sideLabels } from '../measure'
import type { Position } from '../types'

const origin: Position = [4.95, 50.32]
const at = (east: number, north: number): Position => [
  origin[0] + east / (111_320 * Math.cos((origin[1] * Math.PI) / 180)),
  origin[1] + north / 111_320,
]

describe('measuring on the terrain', () => {
  // A bed of 8 × 50 m, the kind of measure designers guess by eye.
  const bed = [at(0, 0), at(50, 0), at(50, 8), at(0, 8)]

  it('reads a line, then a closed surface', () => {
    expect(measureOf(bed.slice(0, 2))).toEqual({ length: expect.closeTo(50, 0), perimeter: null, area: null })
    const closed = measureOf(bed)
    expect(closed.area).toBeCloseTo(400, -1)
    expect(closed.perimeter).toBeCloseTo(116, 0)
    expect(canClose(bed.slice(0, 2))).toBe(false)
  })

  it('becomes a line or a polygon element', () => {
    expect(measureGeometry(bed.slice(0, 1), 'LineString')).toBeNull()
    expect(measureGeometry(bed.slice(0, 2), 'Polygon')).toBeNull()
    expect(measureGeometry(bed, 'Polygon')).toEqual({ type: 'Polygon', coordinates: [[...bed, bed[0]]] })
    expect(measureGeometry(bed, 'LineString')).toEqual({ type: 'LineString', coordinates: bed })
  })

  it('labels each side, the closing one too', () => {
    const format = (m: number) => `${Math.round(m)} m`
    expect(sideLabels(bed, 'LineString', format).features.map((f) => f.properties?.label)).toEqual(['50 m', '8 m', '50 m'])
    expect(sideLabels(bed, 'Polygon', format).features.map((f) => f.properties?.label)).toEqual(['50 m', '8 m', '50 m', '8 m'])
    expect(sideLabels([origin, at(0.4, 0)], 'LineString', format).features).toHaveLength(0)
  })

  it('carries the points to the record screen and back', () => {
    decodePoints(encodePoints(bed)).forEach(([lng, lat], i) => {
      expect(lng).toBeCloseTo(bed[i][0], 7)
      expect(lat).toBeCloseTo(bed[i][1], 7)
    })
    expect(decodePoints(undefined)).toEqual([])
    expect(decodePoints('4.9,50.3;oops;200,10')).toEqual([[4.9, 50.3]])
  })
})
