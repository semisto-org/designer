import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureSupportHatch, SUPPORT_HATCH, supportHatchPixels } from '../../../app/frontend/map/plants/supportHatch.ts'

test('the support hatching is white strokes edged with ink on a transparent tile, which tiles seamlessly', () => {
  const pixels = supportHatchPixels()
  assert.equal(pixels.length, 10 * 10 * 4)
  const alpha = (x: number, y: number) => pixels[(y * 10 + x) * 4 + 3]
  // A fifth of the tile: the strata colour stays readable under it.
  let painted = 0
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (alpha(x, y) > 0) painted++
  assert.equal(painted, 20)
  // The stroke leaves one edge where the next tile picks it up.
  assert.ok(alpha(0, 0) > 0 && alpha(9, 1) > 0 && alpha(0, 9) > 0)
  assert.equal(alpha(3, 3), 0)
  // White on one side, ink on the other: readable on a photo and on a plan.
  assert.equal(pixels[0], 255)
  assert.equal(pixels[(0 * 10 + 9) * 4], 43)
})

test('the hatching is added once per style', () => {
  const images = new Set<string>()
  const map = { hasImage: (id: string) => images.has(id), addImage: (id: string) => { images.add(id) } }
  let added = 0
  const counting = { ...map, addImage: (id: string) => { added++; map.addImage(id) } }
  ensureSupportHatch(counting as never)
  ensureSupportHatch(counting as never)
  assert.equal(added, 1)
  assert.ok(images.has(SUPPORT_HATCH))
})
