import { hasRoom, haloFor, linePath, markAt, MAX_MARKS, noteMark, simplify, toFrame, type SketchMark } from '../sketch'

describe('toFrame', () => {
  it('turns a finger on the surface into the photo frame, clamped to what the server takes', () => {
    expect(toFrame(150, 50, 300, 200)).toEqual([0.5, 0.25])
    expect(toFrame(-90, 400, 300, 200)).toEqual([-0.1, 1.1])
  })
})

describe('simplify', () => {
  it('drops points too close to the previous one and keeps the end', () => {
    expect(simplify([[0, 0], [0.0005, 0], [0.01, 0], [0.0101, 0.00001]])).toEqual([[0, 0], [0.0101, 0]])
    expect(simplify([[0.123456, 0.654321]])).toEqual([[0.1235, 0.6543]])
  })
})

describe('linePath', () => {
  it('draws a dot for one point and curves through midpoints for more', () => {
    expect(linePath([[0.5, 0.5]], 100, 50)).toBe('M50,25 l0.01,0')
    expect(linePath([[0, 0], [0.5, 0.5], [1, 0]], 100, 100)).toBe('M0,0 Q50,50 75,25 L100,0')
    expect(linePath([], 100, 100)).toBe('')
  })
})

describe('markAt', () => {
  const marks: SketchMark[] = [
    { type: 'line', color: '#ffffff', width: 0.006, points: [[0.1, 0.1], [0.9, 0.1]] },
    { type: 'text', color: '#1b1712', size: 0.045, x: 0.2, y: 0.8, text: 'Mare' },
  ]
  it('finds the line or the note under the finger, else -1', () => {
    expect(markAt(marks, 0.5, 0.12, 1.5)).toBe(0)
    expect(markAt(marks, 0.22, 0.78, 1.5)).toBe(1)
    expect(markAt(marks, 0.5, 0.5, 1.5)).toBe(-1)
  })
})

describe('noteMark', () => {
  it('writes a note at the touched place, nothing for an empty one', () => {
    expect(noteMark('  Haie ici ', 0.3, 0.4, '#d64545', 'medium')).toEqual({ type: 'text', color: '#d64545', size: 0.045, x: 0.3, y: 0.4, text: 'Haie ici' })
    expect(noteMark('   ', 0.3, 0.4, '#d64545', 'fine')).toBeNull()
    expect(noteMark('x'.repeat(300), 0, 0, '#ffffff', 'bold')?.text).toHaveLength(200)
  })
})

describe('hasRoom', () => {
  it('stops at the server limits', () => {
    const dot: SketchMark = { type: 'line', color: '#ffffff', width: 0.003, points: [[0, 0]] }
    expect(hasRoom([], dot)).toBe(true)
    expect(hasRoom(Array(MAX_MARKS).fill(dot), dot)).toBe(false)
    expect(hasRoom([{ ...dot, points: Array(20000).fill([0, 0]) }], dot)).toBe(false)
  })
})

describe('haloFor', () => {
  it('puts a dark halo under light inks and a light one under dark inks', () => {
    expect(haloFor('#ffffff')).toContain('27, 23, 18')
    expect(haloFor('#1b1712')).toContain('255, 255, 255')
  })
})
