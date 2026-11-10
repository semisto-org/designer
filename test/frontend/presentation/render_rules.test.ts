import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHiddenInRender, isPresentRendering, isWorkingLayer, presentRender, renderHiddenLayers } from '../../../app/frontend/map/presentation/renderRules.ts'

test('the plan rendering is on only while presenting the project', () => {
  assert.equal(presentRender(true, 'project'), true)
  assert.equal(presentRender(true, 'existing'), false)
  assert.equal(presentRender(false, 'project'), false)
})

test('working marks step aside, the plan stays', () => {
  for (const id of ['features-label', 'plant-labels', 'plant-numbers', 'soil-samples', 'photos-points', 'pending-updates-line', 'drawing-measure-label']) {
    assert.equal(isWorkingLayer(id), true, id)
  }
  for (const id of ['plant-crowns-fill', 'drawing-fill', 'drawing-path-ribbon', 'boundary-line', 'features-point']) {
    assert.equal(isWorkingLayer(id), false, id)
  }
})

test('notes leave the plan, without losing what the person hid', () => {
  assert.deepEqual(renderHiddenLayers(['water'], false), ['water'])
  assert.deepEqual(renderHiddenLayers(['water', 'notes'], true).sort(), ['notes', 'water'])
})

test('free drawings stay in the plan while the map shows them', () => {
  assert.deepEqual(renderHiddenLayers(['water'], true).sort(), ['notes', 'water'])
  assert.deepEqual(renderHiddenLayers(['drawings'], true).sort(), ['drawings', 'notes'])
})

test('measures and observations are not part of the plan', () => {
  assert.equal(isHiddenInRender('infiltration_test'), true)
  assert.equal(isHiddenInRender('pond'), false)
  assert.equal(isHiddenInRender(undefined), false)
})

test('a map tells whether it draws the plan', () => {
  assert.equal(isPresentRendering({ getGlobalState: () => ({ presentRender: true }) }), true)
  assert.equal(isPresentRendering({ getGlobalState: () => ({}) }), false)
  assert.equal(isPresentRendering({}), false)
})
