import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPlantsVisibility, PLANT_OVERLAY_LAYERS } from '../../../app/frontend/map/plants/visibility.ts'

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
  assert.deepEqual(Object.values(map.visibility), ['none', 'none', 'none'])
})

test('showing it again brings them back', () => {
  const map = fakeMap(PLANT_OVERLAY_LAYERS)
  applyPlantsVisibility(map as never, ['plants'])
  applyPlantsVisibility(map as never, ['water'])
  assert.deepEqual(Object.values(map.visibility), ['visible', 'visible', 'visible'])
})

test('layers not installed yet are skipped', () => {
  const map = fakeMap([])
  applyPlantsVisibility(map as never, ['plants'])
  assert.deepEqual(map.visibility, {})
})
