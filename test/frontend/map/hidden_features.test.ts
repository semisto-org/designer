import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeFilter, hiddenPlantIds, hiddenTests, strataKey, UNKNOWN_STRATA } from '../../../app/frontend/map/drawing/hidden.ts'

const f = (id: number, layer: string, kind: string | null) => ({ properties: { id, layer, kind } })
const pond = f(1, 'water', 'pond')
const swale = f(2, 'water', 'swale')
const apple = f(3, 'plants', 'plant')
const clover = f(4, 'plants', 'plant')
const mystery = f(5, 'plants', 'plant')
const patch = f(6, 'plants', 'patch')
const strata: Record<number, string | null> = { 3: 'sub_canopy', 4: 'ground_cover', 5: null }
const strataOf = (feature: { properties: { id: number } }) => strata[feature.properties.id] ?? null
test('nothing hidden adds no filter', () => {
  assert.deepEqual(hiddenTests([], []), [])
  assert.deepEqual(hiddenPlantIds([pond, swale, apple], [], strataOf), [])
})

test('a hidden strata hides its plants, not patches nor other strata', () => {
  assert.deepEqual(hiddenPlantIds([pond, apple, clover, mystery, patch], ['ground_cover'], strataOf), [4])
})

test('plants with no known strata are toggled together', () => {
  assert.equal(strataKey(null), UNKNOWN_STRATA)
  assert.deepEqual(hiddenPlantIds([apple, clover, mystery], [UNKNOWN_STRATA], strataOf), [5])
})

test('the map filter leaves out hidden kinds and plant ids', () => {
  assert.deepEqual(hiddenTests(['pond'], [4, 5]), [
    ['!', ['in', ['coalesce', ['get', 'kind'], ''], ['literal', ['pond']]]],
    ['!', ['in', ['get', 'id'], ['literal', [4, 5]]]],
  ])
})

test('a layer keeps its own filter under what « Calques » hides', () => {
  const own = ['!', ['==', ['get', 'kind'], 'plant']]
  const hide = ['!', ['in', ['get', 'layer'], ['literal', ['networks']]]]
  assert.deepEqual(composeFilter(own, hide), ['all', own, hide])
  assert.deepEqual(composeFilter(null, hide), hide)
  assert.deepEqual(composeFilter(own, null), own)
  assert.equal(composeFilter(null, null), null)
})
