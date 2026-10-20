import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blend, factsOf, layerOf, progressAt, SCENES, sceneAt, sceneOf, type TourFeature } from '../../../app/frontend/components/site/tour/scene.ts'
import { lots } from '../../../app/frontend/components/site/pricing/lots.ts'

const square = (lng: number, lat: number, side: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[lng, lat], [lng + side, lat], [lng + side, lat + side], [lng, lat + side], [lng, lat]]],
})
const feature = (id: number, layer: string, kind: string, geometry: TourFeature['geometry']): TourFeature =>
  ({ type: 'Feature', id, geometry, properties: { layer, kind } })

test('scenes fill the notebook in the order of the method: water before plants', () => {
  assert.equal(SCENES.place.water, 0)
  assert.equal(SCENES.water.water, 1)
  assert.equal(SCENES.water.plants, 0)
  assert.equal(SCENES.palette.water, 1)
  assert.ok(SCENES.growth.year > SCENES.palette.year)
  assert.deepEqual(sceneOf('nope'), SCENES.place, 'an unknown scene falls back to the first one')
})

test('blending two scenes moves every layer and the year, and switches notes halfway', () => {
  const half = blend(SCENES.palette, SCENES.growth, 0.5)
  assert.ok(Math.abs(half.year - (SCENES.palette.year + SCENES.growth.year) / 2) < 1e-9)
  assert.deepEqual(half.notes, SCENES.growth.notes)
  assert.deepEqual(blend(SCENES.palette, SCENES.growth, 0.2).notes, SCENES.palette.notes)
  assert.equal(blend(SCENES.place, SCENES.water, 2).water, 1, 't is clamped')
})

test('the visit moves on near the end of each station, or over the whole way for growth', () => {
  const tops = [0, 1000, 2000]
  assert.deepEqual(progressAt(tops, -50), { index: 0, t: 0 })
  assert.deepEqual(progressAt(tops, 500), { index: 0, t: 0 }, 'nothing moves in the first part')
  assert.equal(progressAt(tops, 800).t, 0.5)
  assert.deepEqual(progressAt(tops, 2500), { index: 2, t: 0 })
  assert.equal(progressAt(tops, 500, [undefined, 1]).t, 0.5, 'a span of 1 spreads the change over the whole way')
  const scenes = [SCENES.palette, SCENES.growth]
  assert.equal(sceneAt(scenes, 1, 0).year, SCENES.growth.year)
})

test('facts are measured on the published map', () => {
  const features = [
    feature(1, 'water', 'pond', square(4.9, 50.3, 0.0005)),
    feature(2, 'water', 'pond', square(4.91, 50.3, 0.0002)),
    feature(3, 'existing', 'building', square(4.92, 50.3, 0.0001)),
    feature(4, 'existing', 'existing_hedge', { type: 'LineString', coordinates: [[4.9, 50.3], [4.901, 50.3]] }),
    feature(5, 'plants', 'plant', { type: 'Point', coordinates: [4.9, 50.3] }),
  ]
  const growth = {
    plants: [{ lng: 4.9, lat: 50.3, speciesId: 1 }, { lng: 4.902, lat: 50.302, speciesId: 2 }],
    patches: [{ ring: [[4.9, 50.3], [4.901, 50.3], [4.901, 50.301]], lines: [{ quantity: 10, speciesId: 2 }, { quantity: 5, speciesId: 3 }] }],
  }
  const facts = factsOf(features, 12000, growth)
  assert.equal(facts.ponds, 2)
  assert.ok(facts.pond && facts.pond.areaM2 > 1500, 'the largest pond')
  assert.equal(facts.draft?.id, 2, 'the draft is a pond that is not the largest one')
  assert.equal(facts.buildings, 1)
  assert.ok(facts.hedgesM > 60 && facts.hedgesM < 80)
  assert.equal(facts.plants, 17)
  assert.equal(facts.species, 3)
  assert.equal(layerOf(features[0]), 'water')
  assert.equal(layerOf(features[4]), null, 'plants are painted from the growth data')
})

test('facts survive a map with nothing drawn yet', () => {
  const facts = factsOf([], null, null)
  assert.equal(facts.pond, null)
  assert.equal(facts.plants, 0)
  assert.equal(facts.plantsAt, null)
})

test('a plan draws as many places as it holds, inside the drawing', () => {
  for (const count of [1, 3, 6, 30]) {
    const drawn = lots(count, 400, 300)
    assert.equal(drawn.length, count)
    for (const lot of drawn) {
      for (const [x, y] of lot.poly) assert.ok(x >= 0 && x <= 400 && y >= 0 && y <= 300, `${count}: ${x},${y}`)
      assert.ok(lot.crowns.length > 0)
    }
  }
  assert.deepEqual(lots(3, 400, 300), lots(3, 400, 300), 'always the same drawing')
})
