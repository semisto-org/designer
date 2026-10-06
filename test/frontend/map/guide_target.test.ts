import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guideTarget, journeyPercent } from '../../../app/frontend/map/editor/guideTarget.ts'
import type { JourneyData } from '../../../app/frontend/types/journey.ts'

const journey = (overrides: Partial<JourneyData> = {}): JourneyData => ({
  stage: 'observe',
  stageIndex: 0,
  next: { type: 'item', step: 'observe', item: 'project_sheet', panel: 'project' },
  steps: [
    { key: 'observe', current: true, done: false, completed: 1, total: 2, items: [
      { key: 'project_sheet', step: 'observe', done: false, panel: 'project' },
      { key: 'layers_seen', step: 'observe', done: true, panel: 'layers', client: true },
    ] },
    { key: 'map', current: false, done: false, completed: 1, total: 2, items: [
      { key: 'boundary', step: 'map', done: true, panel: 'terrain' },
      { key: 'existing', step: 'map', done: false, panel: 'elements', count: 0, target: 3 },
    ] },
    { key: 'design', current: false, done: true, completed: 1, total: 1, items: [
      { key: 'palette', step: 'design', done: true, panel: 'palette' },
    ] },
    { key: 'plant', current: false, done: false, completed: 0, total: 1, items: [
      { key: 'take_action', step: 'plant', done: false, panel: 'actions' },
    ] },
  ],
  ...overrides,
})
const anyPanel = (name: string) => name

test('the current step follows the next action of the journey', () => {
  assert.deepEqual(guideTarget(journey(), 'observe', anyPanel), { kind: 'item', item: 'project_sheet', panel: 'project' })
  assert.deepEqual(guideTarget(journey({ next: { type: 'advance', stage: 'map' } }), 'observe', anyPanel), { kind: 'advance', stage: 'map' })
  assert.deepEqual(guideTarget(journey({ next: { type: 'complete' } }), 'observe', anyPanel), { kind: 'complete' })
})

test('another step shows its first open item, or that it is done', () => {
  assert.deepEqual(guideTarget(journey(), 'map', anyPanel), { kind: 'item', item: 'existing', panel: 'elements' })
  assert.deepEqual(guideTarget(journey(), 'design', anyPanel), { kind: 'step_done' })
})

test('no button when this person has no such panel', () => {
  assert.deepEqual(guideTarget(journey(), 'plant', () => null), { kind: 'item', item: 'take_action', panel: null })
})

test('the progress counts every item of every step', () => {
  assert.equal(journeyPercent(journey()), 50)
  assert.equal(journeyPercent(journey({ steps: [] })), 0)
})
