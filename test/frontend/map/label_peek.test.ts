import { test } from 'node:test'
import assert from 'node:assert/strict'
import { peekLabel } from '../../../app/frontend/map/drawing/labelPeek.ts'
import { applyFeatureLabelsVisibility, FEATURE_LABEL_LAYERS } from '../../../app/frontend/map/layers/labels.ts'

const feature = (properties: Record<string, unknown>) => ({ properties }) as never
const noPlantLabel = () => undefined

test('a plant shows the label the plants overlay wrote for it', () => {
  const labels = new Map([[7, '12 Pommier « Reinette »']])
  assert.equal(peekLabel(feature({ id: 7, layer: 'plants', kind: 'plant' }), (id) => labels.get(id)), '12 Pommier « Reinette »')
})

test('a plant without a written label falls back to its own name', () => {
  assert.equal(peekLabel(feature({ id: 7, layer: 'plants', kind: 'plant', name: 'Le vieux' }), noPlantLabel), 'Le vieux')
})

test('another element shows its name, trimmed', () => {
  assert.equal(peekLabel(feature({ id: 3, layer: 'water', kind: 'pond', name: '  Mare du bas ' }), noPlantLabel), 'Mare du bas')
})

test('nothing for an element without a name, or no element', () => {
  assert.equal(peekLabel(feature({ id: 3, layer: 'water', kind: 'pond', name: '  ' }), noPlantLabel), null)
  assert.equal(peekLabel(feature({ id: 3, layer: 'access', kind: 'path' }), noPlantLabel), null)
  assert.equal(peekLabel(undefined, noPlantLabel), null)
})

function fakeMap(present: string[]) {
  const visibility: Record<string, string> = {}
  let writes = 0
  return {
    visibility,
    get writes() { return writes },
    getLayer: (id: string) => (present.includes(id) ? { id } : undefined),
    getLayoutProperty: (id: string) => visibility[id],
    setLayoutProperty: (id: string, _name: string, value: string) => { visibility[id] = value; writes++ },
  }
}

test('hiding the names hides every element and zone label, and showing brings them back', () => {
  const map = fakeMap(FEATURE_LABEL_LAYERS)
  applyFeatureLabelsVisibility(map as never, true)
  assert.deepEqual(Object.values(map.visibility), FEATURE_LABEL_LAYERS.map(() => 'none'))
  applyFeatureLabelsVisibility(map as never, false)
  assert.deepEqual(Object.values(map.visibility), FEATURE_LABEL_LAYERS.map(() => 'visible'))
})

test('nothing is written when nothing changes or a layer is missing', () => {
  const map = fakeMap(['features-label'])
  applyFeatureLabelsVisibility(map as never, false)
  assert.equal(map.writes, 0)
  applyFeatureLabelsVisibility(map as never, true)
  applyFeatureLabelsVisibility(map as never, true)
  assert.equal(map.writes, 1)
})
