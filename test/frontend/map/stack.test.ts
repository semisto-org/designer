import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FEATURE_STACK, stackMoves } from '../../../app/frontend/map/layers/stack.ts'

function apply(order: string[], moves: { id: string; before: string | undefined }[]): string[] {
  const out = [...order]
  for (const { id, before } of moves) {
    out.splice(out.indexOf(id), 1)
    out.splice(before ? out.indexOf(before) : out.length, 0, id)
  }
  return out
}

// What the editor had on the Lautenne map: the generic surfaces, installed
// again after a base map change, landed over the trees and the crowns.
const drifted = [
  'osm', 'region-ortho', 'time-shade-fill',
  'plant-crowns-fill', 'plant-crowns-line',
  'drawing-fill', 'drawing-crown', 'drawing-line', 'drawing-point', 'drawing-icon',
  'plant-labels-text',
  'boundary-fill', 'boundary-line',
  'features-fill', 'features-line', 'features-point', 'features-label', 'zone-labels',
  'photos-point', 'plant-numbers-disc',
]

test('zones and surfaces go back under the trees and the plants', () => {
  const order = apply(drifted, stackMoves(drifted))
  const at = (id: string) => order.indexOf(id)
  assert.ok(at('features-fill') < at('drawing-crown'), 'a zone under a tree already there')
  assert.ok(at('features-fill') < at('plant-crowns-fill'), 'a zone under a plant crown')
  assert.ok(at('drawing-fill') < at('plant-crowns-fill'), 'a bed or a pond under a plant crown')
  assert.ok(at('features-line') < at('plant-crowns-fill'), 'a line under a plant crown')
  assert.ok(at('plant-crowns-line') < at('features-point'), 'points over the crowns')
  assert.ok(at('features-point') < at('plant-labels-text'), 'names over everything')
  assert.ok(at('boundary-fill') < at('features-fill'), 'the outline under the features')
})

test('layers outside the stack keep their side', () => {
  const order = apply(drifted, stackMoves(drifted))
  const managed = order.filter((id) => FEATURE_STACK.includes(id))
  assert.deepEqual(managed, FEATURE_STACK.filter((id) => drifted.includes(id)))
  assert.deepEqual(order.slice(0, 3), ['osm', 'region-ortho', 'time-shade-fill'])
  assert.deepEqual(order.slice(-2), ['photos-point', 'plant-numbers-disc'])
})

test('nothing moves when the order is right', () => {
  const order = apply(drifted, stackMoves(drifted))
  assert.deepEqual(stackMoves(order), [])
  assert.deepEqual(stackMoves(['osm']), [])
})
