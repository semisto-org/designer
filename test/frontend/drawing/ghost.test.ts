import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GHOST_COLOR, GHOST_OPACITY, ghostPaint, ghostValue } from '../../../app/frontend/map/drawing/ghost.ts'

const isWater = ['==', ['get', 'layer'], 'water']

test('the theme keeps its colour, the rest turns grey', () => {
  assert.deepEqual(ghostValue('#2b7bb9', 'color', isWater), ['case', isWater, '#2b7bb9', GHOST_COLOR])
  assert.deepEqual(ghostValue(['get', 'color'], 'color', isWater), ['case', isWater, ['get', 'color'], GHOST_COLOR])
})

test('opacity fades outside the theme, default opacity included', () => {
  assert.deepEqual(ghostValue(undefined, 'opacity', isWater), ['case', isWater, 1, ['*', 1, GHOST_OPACITY]])
})

test('a layer that is all theme is left alone, one that is not is ghosted with constants', () => {
  assert.equal(ghostValue('#2b7bb9', 'color', true), null)
  assert.equal(ghostValue('#2b7bb9', 'color', false), GHOST_COLOR)
  assert.equal(ghostValue(0.8, 'opacity', false), 0.8 * GHOST_OPACITY)
})

test('a zoom curve keeps its stops and has each output wrapped', () => {
  const curve = ['interpolate', ['linear'], ['zoom'], 15, 0.2, 19, 0.8]
  assert.deepEqual(ghostValue(curve, 'opacity', isWater), [
    'interpolate', ['linear'], ['zoom'],
    15, ['case', isWater, 0.2, ['*', 0.2, GHOST_OPACITY]],
    19, ['case', isWater, 0.8, ['*', 0.8, GHOST_OPACITY]],
  ])
  const step = ['step', ['zoom'], '#111111', 17, '#222222']
  assert.deepEqual(ghostValue(step, 'color', false), ['step', ['zoom'], GHOST_COLOR, 17, GHOST_COLOR])
})

test('zoom read anywhere else, and legacy functions, are left as they are', () => {
  assert.equal(ghostValue(['case', ['>', ['zoom'], 17], 1, 0], 'opacity', isWater), null)
  assert.equal(ghostValue({ stops: [[15, 1]] }, 'opacity', isWater), null)
})

test('paint per layer type: optional colours are only rewritten when set', () => {
  const paint = ghostPaint('symbol', { 'text-color': '#1a1a1a' }, isWater)
  assert.deepEqual(Object.keys(paint).sort(), ['icon-opacity', 'text-color', 'text-opacity'])
  assert.deepEqual(Object.keys(ghostPaint('fill', { 'fill-color': '#fff' }, false)).sort(), ['fill-color', 'fill-opacity'])
  assert.deepEqual(ghostPaint('raster', {}, false), {})
})
