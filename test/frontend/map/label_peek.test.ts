import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markerPeekLabel, peekLabel } from '../../../app/frontend/map/drawing/labelPeek.ts'
import { setSoilLayersVisible } from '../../../app/frontend/map/soil/visibility.ts'
import { setWeatherStationLayersVisible, WEATHER_STATION_LAYER_IDS } from '../../../app/frontend/map/weather_stations/visibility.ts'
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

test('a soil point, a bio-indicator or a station shows its own name on hover', () => {
  assert.equal(markerPeekLabel({ id: 4, label: 'Point 4', status: 'sampled' }), 'Point 4')
  assert.equal(markerPeekLabel({ code: 6434, name: ' Ernage ' }), 'Ernage')
  assert.equal(markerPeekLabel({ id: 2, label: '  ' }), null)
  assert.equal(markerPeekLabel(null), null)
})

test('hiding the names takes the soil names away, keeps their markers and the suggested ranks', () => {
  const present = ['soil-samples-halo', 'soil-samples-circle', 'soil-samples-label', 'soil-observations-circle', 'soil-observations-label', 'soil-suggestions-circle', 'soil-suggestions-rank']
  const map = fakeMap(present)
  const all = { samples: true, bioindicators: true, suggestions: true }
  setSoilLayersVisible(map, all, true)
  assert.equal(map.visibility['soil-samples-label'], 'none')
  assert.equal(map.visibility['soil-observations-label'], 'none')
  assert.equal(map.visibility['soil-samples-circle'], 'visible')
  assert.equal(map.visibility['soil-observations-circle'], 'visible')
  assert.equal(map.visibility['soil-suggestions-rank'], 'visible')
  setSoilLayersVisible(map, all, false)
  assert.equal(map.visibility['soil-samples-label'], 'visible')
  setSoilLayersVisible(map, { ...all, samples: false }, false)
  assert.equal(map.visibility['soil-samples-label'], 'none')
})

test('hiding the names takes the weather station names away, keeps the stations', () => {
  const map = fakeMap([...WEATHER_STATION_LAYER_IDS])
  setWeatherStationLayersVisible(map, true, true)
  assert.equal(map.visibility['weather-stations-label'], 'none')
  assert.equal(map.visibility['weather-stations-icon'], 'visible')
  setWeatherStationLayersVisible(map, true, false)
  assert.equal(map.visibility['weather-stations-label'], 'visible')
})
