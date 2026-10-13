import { test } from 'node:test'
import assert from 'node:assert/strict'
import { featureAt, pickFeature, TOLERANCE_PX } from '../../../app/frontend/map/featurePick.ts'

test('a plant dot wins over the zone it sits in, whatever the order of the hits', () => {
  assert.equal(pickFeature([{ layer: 'features-fill', id: 1 }, { layer: 'features-point', id: 2 }]), 2)
  assert.equal(pickFeature([{ layer: 'features-point', id: 2 }, { layer: 'features-fill', id: 1 }]), 2)
})

test('a plant name or crown selects its plant before the zone', () => {
  assert.equal(pickFeature([{ layer: 'features-fill', id: 1 }, { layer: 'plant-labels-text', id: 7 }]), 7)
  assert.equal(pickFeature([{ layer: 'features-fill', id: 1 }, { layer: 'plant-crowns-fill', id: 7 }]), 7)
})

test('a line wins over the area around it', () => {
  assert.equal(pickFeature([{ layer: 'features-fill', id: 1 }, { layer: 'features-line', id: 3 }]), 3)
})

test('a zone name written on the map selects its zone, a plant still wins', () => {
  assert.equal(pickFeature([{ layer: 'features-fill', id: 1 }, { layer: 'zone-labels', id: 4 }], () => 0), 4)
  assert.equal(pickFeature([{ layer: 'zone-labels', id: 4 }, { layer: 'features-point', id: 2 }]), 2)
})

test('of two nested zones, the smaller one wins', () => {
  const areas: Record<number, number> = { 1: 500, 2: 40 }
  assert.equal(pickFeature([{ layer: 'features-fill', id: 1 }, { layer: 'features-fill', id: 2 }], (id) => areas[id]), 2)
})

test('nothing selectable gives null', () => {
  assert.equal(pickFeature([]), null)
  assert.equal(pickFeature([{ layer: 'comment-badges-circle', id: 4 }, { layer: 'features-point', id: null }]), null)
})

test('dots and names are looked up with a margin, plant layers give their featureId', () => {
  const asked: { geometry: unknown; layers: string[] }[] = []
  const map = {
    getLayer: (id: string) => (['features-point', 'features-fill', 'plant-labels-text'].includes(id) ? { id } : undefined),
    queryRenderedFeatures: (geometry: unknown, options: { layers: string[] }) => {
      asked.push({ geometry, layers: options.layers })
      if (options.layers.includes('plant-labels-text')) return [{ layer: { id: 'plant-labels-text' }, properties: { featureId: 9 } }]
      return [{ layer: { id: 'features-fill' }, id: 1, properties: {} }]
    },
  }
  assert.equal(featureAt(map as never, { x: 50, y: 50 }), 9)
  assert.deepEqual(asked[0], {
    geometry: [[50 - TOLERANCE_PX, 50 - TOLERANCE_PX], [50 + TOLERANCE_PX, 50 + TOLERANCE_PX]],
    layers: ['features-point', 'plant-labels-text'],
  })
  assert.deepEqual(asked[1], { geometry: [50, 50], layers: ['features-fill'] })
})
