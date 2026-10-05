import { test } from 'node:test'
import assert from 'node:assert/strict'
import { photoClickAction } from '../../../app/frontend/map/photos/click.ts'

function fakeMap(layers: string[], hits: number) {
  const asked: string[][] = []
  return {
    asked,
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    queryRenderedFeatures: (_point: unknown, options: { layers: string[] }) => {
      asked.push(options.layers)
      return Array.from({ length: hits }, () => ({}))
    },
  }
}

test('a photo alone opens', () => {
  assert.equal(photoClickAction(fakeMap(['features-point', 'features-line'], 0) as never, [10, 10]), 'open')
})

test('a photo on a drawn element is offered, so the element can be selected', () => {
  assert.equal(photoClickAction(fakeMap(['features-point', 'features-line'], 1) as never, [10, 10]), 'offer')
})

test('areas under a photo do not count', () => {
  const map = fakeMap(['features-fill', 'features-point'], 1)
  photoClickAction(map as never, [10, 10])
  assert.deepEqual(map.asked, [['features-point']])
})

test('without element layers the photo opens', () => {
  assert.equal(photoClickAction(fakeMap([], 1) as never, [10, 10]), 'open')
})
