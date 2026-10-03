import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hillshade, shadePixels } from '../../../app/frontend/relief/shade.ts'

const plane = (cols: number, rows: number, z: (c: number, r: number) => number) => {
  const out = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[r * cols + c] = z(c, r)
  return out
}

test('flat ground is lit by the sine of the sun altitude', () => {
  const shade = hillshade(plane(5, 5, () => 100), 5, 5, 1)
  for (const v of shade) assert.ok(Math.abs(v - Math.SQRT1_2) < 1e-6)
})

test('with light from the north-west, a slope facing north-west is brighter than one facing south-east', () => {
  // Rows run south: z rising with c (east) and r (south) faces north-west.
  const facingNW = hillshade(plane(7, 7, (c, r) => 0.3 * (c + r)), 7, 7, 1)
  const facingSE = hillshade(plane(7, 7, (c, r) => -0.3 * (c + r)), 7, 7, 1)
  assert.ok(facingNW[24] > Math.SQRT1_2)
  assert.ok(facingSE[24] < Math.SQRT1_2)
})

test('flat ground leaves the overlay transparent', () => {
  const pixels = shadePixels(new Float32Array([Math.SQRT1_2, 0.2, 1]))
  assert.equal(pixels[3], 0)
  assert.ok(pixels[7] > 100) // a dark slope
  assert.equal(pixels[8], 255) // a lit slope, light
})
