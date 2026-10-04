import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aerialMove, aerialViewIdOf } from '../../../app/frontend/drone/placement.ts'

const bases = new Set(['background', 'osm', 'region-ortho_2026', 'region-plan--water', 'region-plan--labels'])
const isFloor = (id: string) => bases.has(id)

test('drone ids carry the view id, nothing else does', () => {
  assert.equal(aerialViewIdOf('aerial-view-12'), 12)
  assert.equal(aerialViewIdOf('region-ortho_2026'), null)
  assert.equal(aerialViewIdOf('aerial-view-x'), null)
  assert.equal(aerialViewIdOf(undefined), null)
})

test('a view just added on top goes right above the base map, under the overlays and the drawing', () => {
  const order = ['background', 'osm', 'region-ortho_2026', 'region-cadastre', 'boundary-line', 'features-fill', 'aerial-view-3']
  assert.deepEqual(aerialMove(order, isFloor), { before: 'region-cadastre' })
})

test('nothing moves when the views already sit on the base map', () => {
  const order = ['background', 'osm', 'region-ortho_2026', 'aerial-view-3', 'aerial-view-1', 'region-cadastre', 'features-fill']
  assert.equal(aerialMove(order, isFloor), null)
  assert.equal(aerialMove(['background', 'osm', 'boundary-line'], isFloor), null)
})

test('a style base installed later above the views pushes them up again', () => {
  const order = ['background', 'osm', 'region-ortho_2026', 'aerial-view-3', 'region-plan--water', 'region-plan--labels', 'boundary-line']
  assert.deepEqual(aerialMove(order, isFloor), { before: 'boundary-line' })
})

test('with no base installed the views sit on the neutral fallback, always under the drawing', () => {
  assert.deepEqual(aerialMove(['background', 'osm', 'boundary-line', 'aerial-view-3'], isFloor), { before: 'boundary-line' })
  assert.deepEqual(aerialMove(['boundary-line', 'aerial-view-3'], isFloor), { before: 'boundary-line' })
  assert.equal(aerialMove(['aerial-view-3', 'boundary-line'], isFloor), null)
})

test('above a base map with nothing over it, the views go on top', () => {
  assert.deepEqual(aerialMove(['aerial-view-3', 'region-ortho_2026'], isFloor), { before: undefined })
  assert.equal(aerialMove(['region-ortho_2026', 'aerial-view-3'], isFloor), null)
})
