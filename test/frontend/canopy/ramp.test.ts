import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CANOPY_RAMP, canopyBeforeId, canopyColor, decodeGrid, gridCorners, paintHeights } from '../../../app/frontend/map/canopy/ramp.ts'

test('bare ground is transparent, then darker greens as trees grow', () => {
  assert.equal(canopyColor(0), null)
  assert.deepEqual(canopyColor(2), CANOPY_RAMP[0].color)
  assert.deepEqual(canopyColor(3), CANOPY_RAMP[1].color)
  assert.deepEqual(canopyColor(15), CANOPY_RAMP[2].color)
  assert.deepEqual(canopyColor(254), CANOPY_RAMP[4].color)
  const lightness = CANOPY_RAMP.map(({ color: [r, g, b] }) => r + g + b)
  assert.deepEqual([...lightness].sort((a, b) => b - a), lightness)
})

test('decodes the base64 grid and paints it row by row', () => {
  const heights = decodeGrid(Buffer.from([0, 5, 25, 40]).toString('base64'))
  assert.deepEqual([...heights], [0, 5, 25, 40])
  const pixels = paintHeights(heights, 2, 2)
  assert.equal(pixels.length, 16)
  assert.deepEqual([...pixels.slice(0, 4)], [0, 0, 0, 0])
  assert.deepEqual([...pixels.slice(4, 8)], CANOPY_RAMP[1].color)
  assert.deepEqual([...pixels.slice(12, 16)], CANOPY_RAMP[4].color)
})

test('image corners go clockwise from the north-west', () => {
  assert.deepEqual(gridCorners({ west: 4, south: 50, east: 5, north: 51 }), [[4, 51], [5, 51], [5, 50], [4, 50]])
})

test('the canopy sits under the outline and the drawing, above the base maps and overlays', () => {
  const order = ['background', 'osm', 'region-ortho', 'region-soils', 'canopy-height', 'boundary-fill', 'features-fill', 'drawing-fill']
  assert.equal(canopyBeforeId(order, 'canopy-height'), 'boundary-fill')
  assert.equal(canopyBeforeId(['background', 'osm'], 'canopy-height'), undefined)
})
