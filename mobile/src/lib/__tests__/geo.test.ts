import { boundsOf, anchor, bearing, cleanTrace, distance, expandBbox, gpsProperties, lineLength, ringArea } from '../geo'

describe('geo', () => {
  const a: [number, number] = [4.95, 50.32]
  const north: [number, number] = [4.95, 50.32 + 0.001]

  it('measures distances and bearings in meters and degrees', () => {
    expect(distance(a, north)).toBeCloseTo(111.2, 0)
    expect(bearing(a, north)).toBeCloseTo(0, 3)
    expect(bearing(a, [4.96, 50.32])).toBeCloseTo(90, 0)
    expect(lineLength([a, north, a])).toBeCloseTo(222.4, 0)
  })

  it('computes the area of a 100 m square', () => {
    const dLng = 100 / (111_320 * Math.cos((50.32 * Math.PI) / 180))
    const dLat = 100 / 111_320
    const ring: [number, number][] = [a, [a[0] + dLng, a[1]], [a[0] + dLng, a[1] + dLat], [a[0], a[1] + dLat], a]
    expect(ringArea(ring)).toBeGreaterThan(9900)
    expect(ringArea(ring)).toBeLessThan(10100)
  })

  it('cleans a trace: inaccurate fixes and tiny steps go', () => {
    const fixes = [
      { position: a, accuracy: 5 },
      { position: [4.95, 50.32001] as [number, number], accuracy: 5 }, // ~1 m
      { position: north, accuracy: 40 },
      { position: north, accuracy: 6 },
    ]
    expect(cleanTrace(fixes)).toEqual([a, north])
  })

  it('drops GPS jumps, and follows the walker when the jumps go on', () => {
    const east = (m: number): [number, number] => [4.95 + m / (111_320 * Math.cos((50.32 * Math.PI) / 180)), 50.32]
    const walk = [
      { position: east(0), accuracy: 5, at: 0 },
      { position: east(3), accuracy: 5, at: 2000 },
      { position: east(60), accuracy: 8, at: 3000 }, // 57 m in a second
      { position: east(6), accuracy: 5, at: 4000 },
    ]
    expect(cleanTrace(walk)).toEqual([east(0), east(3), east(6)])
    const moved = [
      { position: east(0), accuracy: 5, at: 0 },
      { position: east(80), accuracy: 5, at: 1000 },
      { position: east(83), accuracy: 5, at: 3000 },
      { position: east(86), accuracy: 5, at: 5000 },
    ]
    expect(cleanTrace(moved)).toEqual([east(0), east(86)])
    // Without times (older traces), only accuracy and steps count.
    expect(cleanTrace([{ position: east(0), accuracy: 5 }, { position: east(60), accuracy: 5 }])).toEqual([east(0), east(60)])
  })

  it('anchors and grows boxes', () => {
    expect(anchor({ type: 'LineString', coordinates: [[0, 0], [2, 2]] })).toEqual([1, 1])
    const [w, s, e, n] = expandBbox([4.9, 50.3, 5.0, 50.4], 150)
    expect(s).toBeCloseTo(50.3 - 150 / 111_320, 6)
    expect(w).toBeLessThan(4.9)
    expect(e).toBeGreaterThan(5.0)
    expect(n).toBeGreaterThan(50.4)
  })

  it('keeps the GPS accuracy of a placed point, rounded to the decimeter', () => {
    expect(gpsProperties(14.237)).toEqual({ gps_accuracy_m: 14.2 })
    expect(gpsProperties(null)).toEqual({})
    expect(gpsProperties(0)).toEqual({})
  })
})

describe('boundsOf', () => {
  it('frames a polygon by its vertices, a point by itself, nothing by null', () => {
    expect(boundsOf({ type: 'Polygon', coordinates: [[[4.9, 50.3], [4.92, 50.31], [4.91, 50.29], [4.9, 50.3]]] })).toEqual([4.9, 50.29, 4.92, 50.31])
    expect(boundsOf({ type: 'Point', coordinates: [4.9, 50.3] })).toEqual([4.9, 50.3, 4.9, 50.3])
    expect(boundsOf(null)).toBeNull()
  })
})
