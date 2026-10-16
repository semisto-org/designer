import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clusterClickAction, photoClickAction } from '../../../app/frontend/map/photos/click.ts'

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

test('a group spread over the land zooms in until it splits', () => {
  assert.equal(clusterClickAction(17, 15), 'zoom')
  assert.equal(clusterClickAction(20, 18.5), 'zoom')
})

test('a group of photos taken from the same spot opens them', () => {
  assert.equal(clusterClickAction(21, 16), 'open')
  assert.equal(clusterClickAction(23, 19.5), 'open')
})

test('a group that zooming no longer splits opens them', () => {
  assert.equal(clusterClickAction(19, 19.5), 'open')
})
