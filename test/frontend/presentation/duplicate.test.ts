import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duplicateStep, MAX_STEPS } from '../../../app/frontend/map/presentation/duplicate.ts'
import type { PresentationStep } from '../../../app/frontend/map/presentation/types.ts'

const step = (id: string, extra: Partial<PresentationStep> = {}): PresentationStep => ({ id, title: id, shown: true, captured: true, view: {}, ...extra })

test('the copy lands just after its original, with the same view and text', () => {
  const view = { camera: { center: [4.9, 50.3] as [number, number], zoom: 18, bearing: 0, pitch: 0 }, hiddenLayers: ['notes'] }
  const steps = [step('a'), step('b', { note: 'à dire', slide: { body: 'Raison d’être' }, view }), step('c')]
  const result = duplicateStep(steps, 'b', 'b2', 'b (copie)')
  assert.ok(result)
  assert.deepEqual(result.steps.map((s) => s.id), ['a', 'b', 'b2', 'c'])
  assert.equal(result.copy.title, 'b (copie)')
  assert.equal(result.copy.note, 'à dire')
  assert.deepEqual(result.copy.slide, { body: 'Raison d’être' })
  assert.deepEqual(result.copy.view, view)
  // A deep copy: changing the copy's view leaves the original alone.
  result.copy.view.hiddenLayers?.push('plants')
  assert.deepEqual(steps[1].view.hiddenLayers, ['notes'])
})

test('the copy leaves the template key and the AI draft behind', () => {
  const steps = [step('wind', { key: 'wind', proposal: { body: 'brouillon', new: false } })]
  const result = duplicateStep(steps, 'wind', 'w2', 'Vent (copie)')
  assert.ok(result)
  assert.equal(result.copy.key, undefined)
  assert.equal(result.copy.proposal, undefined)
  assert.equal(steps[0].key, 'wind')
})

test('nothing is copied for an unknown step or a full presentation', () => {
  assert.equal(duplicateStep([step('a')], 'z', 'z2', 'z'), null)
  const full = Array.from({ length: MAX_STEPS }, (_, i) => step(String(i)))
  assert.equal(duplicateStep(full, '0', 'x', 'x'), null)
})
