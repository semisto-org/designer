import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STRATA_COLORS, strataCounts } from '../../../app/frontend/map/plants/strataColors.ts'
import { STRATA } from '../../../app/frontend/types/plants.ts'

// CIE L*a*b* distance between two sRGB colours (CIE76).
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const distance = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))

test('every strata has its own colour', () => {
  assert.deepEqual(Object.keys(STRATA_COLORS).sort(), [...STRATA].sort())
  for (const color of Object.values(STRATA_COLORS)) assert.match(color, /^#[0-9a-f]{6}$/)
})

test('two strata never share a colour one could mistake for the other', () => {
  for (const a of STRATA) {
    for (const b of STRATA) {
      if (a >= b) continue
      assert.ok(distance(STRATA_COLORS[a], STRATA_COLORS[b]) > 25, `${a} and ${b} are too close`)
    }
  }
})

test('strata counts go from the highest strata down and leave absent ones out', () => {
  assert.deepEqual(strataCounts(['shrub', 'canopy', 'shrub', 'vine']), [
    { strata: 'canopy', count: 1 },
    { strata: 'shrub', count: 2 },
    { strata: 'vine', count: 1 },
  ])
  assert.deepEqual(strataCounts([]), [])
})
