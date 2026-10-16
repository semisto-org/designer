import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPlantsVisibility, PLANT_NUMBER_LAYERS, PLANT_OVERLAY_LAYERS } from '../../../app/frontend/map/plants/visibility.ts'

function fakeMap(present: string[]) {
  const visibility: Record<string, string> = {}
  return {
    visibility,
    getLayer: (id: string) => (present.includes(id) ? { id } : undefined),
    setLayoutProperty: (id: string, _name: string, value: string) => { visibility[id] = value },
  }
}

test('hiding the plants layer hides the crowns and their names', () => {
  const map = fakeMap(PLANT_OVERLAY_LAYERS)
  applyPlantsVisibility(map as never, ['existing', 'plants'])
  assert.deepEqual(Object.values(map.visibility), PLANT_OVERLAY_LAYERS.map(() => 'none'))
})

test('showing it again brings them back', () => {
  const map = fakeMap(PLANT_OVERLAY_LAYERS)
  applyPlantsVisibility(map as never, ['plants'])
  applyPlantsVisibility(map as never, ['water'])
  assert.deepEqual(Object.values(map.visibility), PLANT_OVERLAY_LAYERS.map(() => 'visible'))
})

test('layers not installed yet are skipped', () => {
  const map = fakeMap([])
  applyPlantsVisibility(map as never, ['plants'])
  assert.deepEqual(map.visibility, {})
})

test('« Numéro » shows the numbered pastilles instead of the names', () => {
  const map = fakeMap([...PLANT_OVERLAY_LAYERS, ...PLANT_NUMBER_LAYERS])
  applyPlantsVisibility(map as never, [], 'number')
  assert.equal(map.visibility['plant-labels-text'], 'none')
  assert.equal(map.visibility['plant-crowns-fill'], 'visible')
  for (const id of PLANT_NUMBER_LAYERS) assert.equal(map.visibility[id], 'visible')
  applyPlantsVisibility(map as never, [], 'code')
  assert.equal(map.visibility['plant-labels-text'], 'visible')
  for (const id of PLANT_NUMBER_LAYERS) assert.equal(map.visibility[id], 'none')
})

test('hiding the plants layer hides the numbers too', () => {
  const map = fakeMap([...PLANT_OVERLAY_LAYERS, ...PLANT_NUMBER_LAYERS])
  applyPlantsVisibility(map as never, ['plants'], 'number')
  assert.ok(Object.values(map.visibility).every((v) => v === 'none'))
})
