import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyNameLayersVisibility, hoverFilter, hoverLayerId, hoverLayerSpec, HOVER_MIN_ZOOM, NAME_LAYERS, PLANT_NAME_LAYER, shownTest,
} from '../../../app/frontend/map/labels/hover.ts'
import { applyPlantsVisibility } from '../../../app/frontend/map/plants/visibility.ts'

function fakeMap(present: string[]) {
  const visibility: Record<string, string> = {}
  return {
    visibility,
    getLayer: (id: string) => (present.includes(id) ? { id } : undefined),
    getLayoutProperty: (id: string) => visibility[id],
    setLayoutProperty: (id: string, _name: string, value: string) => { visibility[id] = value },
  }
}

test('plants are found by their element id, other names by their own id', () => {
  assert.deepEqual(shownTest(PLANT_NAME_LAYER, [3]), ['in', ['get', 'featureId'], ['literal', [3]]])
  assert.deepEqual(shownTest('zone-labels', [3, 7]), ['in', ['get', 'id'], ['literal', [3, 7]]])
})

test('a twin keeps what its layer names, for the shown elements only', () => {
  const base = ['==', ['get', 'kind'], 'zone']
  assert.deepEqual(hoverFilter('zone-labels', [5], base), ['all', base, ['in', ['get', 'id'], ['literal', [5]]]])
  // A plant's name ignores its zoom by crown size once asked for.
  assert.deepEqual(hoverFilter(PLANT_NAME_LAYER, [5], ['>=', ['zoom'], ['get', 'minZoom']]), ['in', ['get', 'featureId'], ['literal', [5]]])
  // Nothing hovered: nothing shown.
  assert.deepEqual(hoverFilter('features-label', [], null), ['in', ['get', 'id'], ['literal', []]])
})

test('the twin looks like its layer, is always placed and shows from further out', () => {
  const spec = {
    id: 'features-label', type: 'symbol', source: 'features', minzoom: 17,
    layout: { 'text-field': ['get', 'name'], 'text-size': 11, visibility: 'none' }, paint: { 'text-color': '#ffffff' },
  }
  const twin = hoverLayerSpec(spec as never, [1], null) as typeof spec & { filter: unknown }
  assert.equal(twin.id, hoverLayerId('features-label'))
  assert.equal(twin.minzoom, HOVER_MIN_ZOOM)
  assert.equal(twin.source, 'features')
  assert.deepEqual(twin.paint, spec.paint)
  assert.equal(twin.layout['text-size'], 11)
  assert.equal(twin.layout.visibility, 'visible')
  assert.equal((twin.layout as Record<string, unknown>)['text-allow-overlap'], true)
  assert.deepEqual(twin.filter, ['in', ['get', 'id'], ['literal', [1]]])
})

test('hiding the names hides the layers of the features source, not the plants (their overlay does)', () => {
  const map = fakeMap([...NAME_LAYERS])
  applyNameLayersVisibility(map as never, true)
  assert.deepEqual(map.visibility, { 'features-label': 'none', 'zone-labels': 'none', 'zone-labels-line': 'none' })
  applyNameLayersVisibility(map as never, false)
  assert.ok(Object.values(map.visibility).every((v) => v === 'visible'))
})

test('the plants overlay hides its names too, keeping the crowns', () => {
  const map = fakeMap(['plant-labels-text', 'plant-crowns-fill'])
  applyPlantsVisibility(map as never, [], 'name', true)
  assert.equal(map.visibility['plant-labels-text'], 'none')
  assert.equal(map.visibility['plant-crowns-fill'], 'visible')
  applyPlantsVisibility(map as never, [], 'name', false)
  assert.equal(map.visibility['plant-labels-text'], 'visible')
})
