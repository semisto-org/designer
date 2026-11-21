import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createExpression } from '@maplibre/maplibre-gl-style-spec'
import {
  PLANT_SHEET_SHOWN, SHEET_RANK_EXPR, sheetCounts, sheetLook, sheetOf, sheetRank, suggestedSheet, TRACING_FACTOR, TRACING_SHOWN, UNDER_OPACITY, type Sheet,
} from '../../../app/frontend/map/tracing/sheets.ts'

const bubble = { layer: 'drawings', kind: 'bubble', status: 'active' }
const pond = { layer: 'water', kind: 'pond', status: 'active', planned: true }
const oldPond = { layer: 'water', kind: 'pond', status: 'active' }
const plannedTree = { layer: 'plants', kind: 'plant', status: 'active' }
const plantedTree = { layer: 'plants', kind: 'plant', status: 'active', planted_on: '2020-03-01' }
const draftHedge = { layer: 'structures', kind: 'hedge', status: 'draft' }
const note = { layer: 'notes', kind: 'note', status: 'active' }
const pinnedNote = { ...note, tracing: 'frame' }
const zone = { layer: 'drawings', kind: 'zone', status: 'active' }

test('every element finds its sheet; what is on the ground is the base plan', () => {
  assert.equal(sheetOf(bubble), 'bubbles')
  assert.equal(sheetOf(pond), 'frame')
  assert.equal(sheetOf(draftHedge), 'frame')
  assert.equal(sheetOf(plannedTree), 'planting')
  assert.equal(sheetOf(oldPond), null)
  assert.equal(sheetOf(plantedTree), null)
  assert.equal(sheetOf(note), null)
  assert.equal(sheetOf(zone), null)
  assert.equal(sheetOf(pinnedNote), 'frame')
})

test('the sheets under the table show through the paper, the ones above wait', () => {
  assert.equal(sheetLook(bubble, 'frame'), 'under')
  assert.equal(sheetLook(pond, 'frame'), 'whole')
  assert.equal(sheetLook(plannedTree, 'frame'), 'hidden')
  assert.equal(sheetLook(plantedTree, 'bubbles'), 'whole')
  assert.equal(sheetLook(plannedTree, null), 'whole')
})

function evaluate(expression: unknown, props: Record<string, unknown>, on: number, type: 'number' | 'boolean') {
  const result = createExpression(expression, 'test', { type, 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } } as never, { tracingSheet: on })
  if (result.result !== 'success') throw new Error(JSON.stringify(result.value))
  return result.value.evaluate({ zoom: 18 } as never, { type: 'Point', properties: props } as never)
}

test('the map paint agrees with sheetOf and sheetLook', () => {
  const all = [bubble, pond, oldPond, plannedTree, plantedTree, draftHedge, note, pinnedNote, zone]
  for (const props of all) {
    assert.equal(evaluate(SHEET_RANK_EXPR, props, 0, 'number'), sheetRank(sheetOf(props)), JSON.stringify(props))
    for (const on of [0, 1, 2, 3]) {
      const sheet = (['bubbles', 'frame', 'planting'] as Sheet[])[on - 1] ?? null
      const look = sheetLook(props, sheet)
      assert.equal(evaluate(TRACING_FACTOR, props, on, 'number'), look === 'whole' ? 1 : look === 'under' ? UNDER_OPACITY : 0, `${JSON.stringify(props)} on ${on}`)
      assert.equal(evaluate(TRACING_SHOWN, props, on, 'boolean'), look !== 'hidden', `${JSON.stringify(props)} shown on ${on}`)
    }
  }
})

test('a planned crown waits for the planting sheet; a planted one is the base plan', () => {
  assert.equal(evaluate(PLANT_SHEET_SHOWN, { planted: false }, 2, 'boolean'), false)
  assert.equal(evaluate(PLANT_SHEET_SHOWN, { planted: false }, 3, 'boolean'), true)
  assert.equal(evaluate(PLANT_SHEET_SHOWN, { planted: true }, 1, 'boolean'), true)
  assert.equal(evaluate(PLANT_SHEET_SHOWN, { planted: false }, 0, 'boolean'), true)
})

test('the card suggests the first sheet still empty', () => {
  const counts = sheetCounts([{ properties: bubble }, { properties: { ...bubble, status: 'rejected' } }, { properties: pond }])
  assert.deepEqual(counts, { bubbles: 1, frame: 1, planting: 0 })
  assert.equal(suggestedSheet(counts), 'planting')
  assert.equal(suggestedSheet({ bubbles: 0, frame: 4, planting: 9 }), 'bubbles')
})
