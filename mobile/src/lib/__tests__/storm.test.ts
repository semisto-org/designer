import { markGeometry, stormProperties, thinStroke } from '../storm'

describe('storm', () => {
  it('thins a finger stroke and keeps its end', () => {
    const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 7, y: 0 }, { x: 9, y: 0 }]
    expect(thinStroke(points)).toEqual([{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 9, y: 0 }])
    expect(thinStroke([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }])
  })

  it('makes a line of running water, a surface of standing water, a point of a seep', () => {
    const c: [number, number][] = [[4.9, 50.3], [4.91, 50.3], [4.91, 50.31]]
    expect(markGeometry({ id: 1, water: 'flows', coordinates: c })).toEqual({ type: 'LineString', coordinates: c })
    expect(markGeometry({ id: 1, water: 'pools', coordinates: c })).toEqual({ type: 'Polygon', coordinates: [[...c, c[0]]] })
    expect(markGeometry({ id: 1, water: 'seeps', coordinates: c })).toEqual({ type: 'Point', coordinates: c[2] })
    expect(markGeometry({ id: 1, water: 'flows', coordinates: c.slice(0, 1) })).toBeNull()
    expect(markGeometry({ id: 1, water: 'pools', coordinates: c.slice(0, 2) })).toBeNull()
  })

  it('stores the rain as the server expects it', () => {
    expect(stormProperties({ rain: 'storm', rainMm: '12,3', muddy: true, observedAt: '2026-10-16T13:00:00.000Z' }))
      .toEqual({ observed_at: '2026-10-16T13:00:00.000Z', rain: 'storm', rain_mm: 12.5, muddy: true })
    expect(stormProperties({ rain: null, rainMm: 'beaucoup', muddy: false, observedAt: 'x' })).toEqual({ observed_at: 'x' })
  })
})
