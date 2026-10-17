import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureLabelBackground, LABEL_IMAGE, labelBackground, markerLabel, PAPER_LABEL_IMAGE, PAPER_LABEL_OPACITY } from '../../../app/frontend/map/layers/labels.ts'

test('marker labels are white text on the stretchable background', () => {
  const { layout, paint } = markerLabel(['get', 'name'])
  assert.equal(paint['text-color'], '#ffffff')
  assert.equal(paint['text-halo-width'], undefined)
  assert.equal(layout['icon-image'], LABEL_IMAGE)
  assert.equal(layout['icon-text-fit'], 'both')
  assert.deepEqual(layout['text-field'], ['get', 'name'])
})

test('a label keeps its own placement', () => {
  const { layout } = markerLabel(['get', 'label'], { 'text-anchor': 'top', 'text-offset': [0, 1.1] })
  assert.equal(layout['text-anchor'], 'top')
  assert.deepEqual(layout['text-offset'], [0, 1.1])
})

test('the background is black at 70 % opacity with rounded corners', () => {
  const image = labelBackground()
  const pixel = (x: number, y: number) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))
  const middle = Math.floor(image.width / 2)
  assert.deepEqual(pixel(middle, middle), [0, 0, 0, Math.round(255 * 0.7)])
  assert.equal(pixel(0, 0)[3], 0)
  assert.equal(image.data.length, image.width * image.height * 4)
  const [[x0, x1]] = image.stretchX!
  assert.ok(x0 < middle && middle < x1)
})

test('the background image is added once and comes back after a style swap', () => {
  const images = new Map<string, unknown>()
  const listeners: Array<(e: { id: string }) => void> = []
  const map = {
    hasImage: (id: string) => images.has(id),
    addImage: (id: string, image: unknown) => { images.set(id, image) },
    on: (_type: string, listener: (e: { id: string }) => void) => { listeners.push(listener) },
  }
  ensureLabelBackground(map as never)
  ensureLabelBackground(map as never)
  assert.equal(images.size, 2)
  assert.equal(listeners.length, 1)
  images.clear()
  listeners[0]({ id: LABEL_IMAGE })
  assert.ok(images.has(LABEL_IMAGE))
})

test('zone names get a paper background, beige clair at 90 % opacity', () => {
  const image = labelBackground([0xf7, 0xf3, 0xea], PAPER_LABEL_OPACITY)
  const middle = Math.floor(image.width / 2)
  const i = (middle * image.width + middle) * 4
  assert.deepEqual(Array.from(image.data.slice(i, i + 4)), [0xf7, 0xf3, 0xea, Math.round(255 * 0.9)])
})

test('both backgrounds are registered and each comes back after a style swap', () => {
  const images = new Map<string, unknown>()
  const listeners: Array<(e: { id: string }) => void> = []
  const map = {
    hasImage: (id: string) => images.has(id),
    addImage: (id: string, image: unknown) => { images.set(id, image) },
    on: (_type: string, listener: (e: { id: string }) => void) => { listeners.push(listener) },
  }
  ensureLabelBackground(map as never)
  assert.deepEqual([...images.keys()].sort(), [LABEL_IMAGE, PAPER_LABEL_IMAGE].sort())
  images.clear()
  listeners[0]({ id: PAPER_LABEL_IMAGE })
  assert.deepEqual([...images.keys()], [PAPER_LABEL_IMAGE])
})
