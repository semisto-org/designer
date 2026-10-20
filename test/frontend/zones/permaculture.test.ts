import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Polygon } from 'geojson'
import { destination } from '../../../app/frontend/map/sectors/sectors.ts'
import { anchorOf, proposeZones, zoneAdvice, zoneAt, zoneOfFeature } from '../../../app/frontend/map/zones/permaculture.ts'

const yvoir = [4.88, 50.33]
/** A square of `half` metres each side of `centre`. */
const square = (centre: number[], half: number): Polygon => {
  const n = destination(centre, 0, half)[1], s = destination(centre, 180, half)[1]
  const e = destination(centre, 90, half)[0], w = destination(centre, 270, half)[0]
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }
}
const house = square(yvoir, 5)
const terrain = square(yvoir, 120)
const feature = (id: number, kind: string, geometry: object, properties: object = {}) =>
  ({ type: 'Feature', geometry, properties: { id, kind, layer: kind === 'permaculture_zone' ? 'notes' : 'structures', status: 'active', ...properties } }) as never

test('zones are proposed as rings around the house, cut to the terrain', () => {
  const zones = proposeZones({ houses: [house], paths: [], boundary: terrain })
  assert.deepEqual([...new Set(zones.map((z) => z.number))], [1, 2, 3, 4])
  // Zone 1: a 15 m band around a 10 m house, its hole the house.
  assert.ok(zones[0].areaM2 > 1250 && zones[0].areaM2 < 1350, String(zones[0].areaM2))
  const total = zones.reduce((sum, z) => sum + z.areaM2, 0)
  assert.ok(Math.abs(total + 100 - 240 * 240) < 400, String(total))
})

test('a small garden stops at the zones it holds', () => {
  const zones = proposeZones({ houses: [house], paths: [], boundary: square(yvoir, 30) })
  assert.deepEqual([...new Set(zones.map((z) => z.number))], [1, 2])
})

test('a path from the house stretches zone 1 along it', () => {
  const path = { type: 'LineString' as const, coordinates: [yvoir, destination(yvoir, 90, 40)] }
  const plain = proposeZones({ houses: [house], paths: [], boundary: terrain })[0].areaM2
  const along = proposeZones({ houses: [house], paths: [path], boundary: terrain })[0].areaM2
  assert.ok(along > plain + 50, `${plain} → ${along}`)
})

test('a place takes the lowest zone over it, and the house is zone 0', () => {
  const features = [
    feature(1, 'building', house, { dwelling: true }),
    feature(2, 'permaculture_zone', square(yvoir, 20), { zone_number: 1 }),
    feature(3, 'permaculture_zone', square(yvoir, 60), { zone_number: 2 }),
  ]
  assert.equal(zoneAt(yvoir, features), 0)
  assert.equal(zoneAt(destination(yvoir, 0, 15), features), 1)
  assert.equal(zoneAt(destination(yvoir, 0, 40), features), 2)
  assert.equal(zoneAt(destination(yvoir, 0, 90), features), null)
  assert.equal(zoneOfFeature(feature(9, 'compost', { type: 'Point', coordinates: destination(yvoir, 45, 30) }), features), 2)
  assert.deepEqual(anchorOf({ type: 'Point', coordinates: [1, 2] }), [1, 2])
})

test('the companion warns of a hen house far out, a missing wild zone and an open windward side', () => {
  const features = [
    feature(1, 'building', house, { dwelling: true }),
    feature(2, 'permaculture_zone', square(yvoir, 20), { zone_number: 1 }),
    feature(3, 'permaculture_zone', square(yvoir, 110), { zone_number: 4 }),
    feature(4, 'poultry_house', { type: 'Point', coordinates: destination(yvoir, 180, 80) }),
    feature(5, 'compost', { type: 'Point', coordinates: destination(yvoir, 180, 10) }),
    feature(6, 'windbreak', { type: 'LineString', coordinates: [destination(yvoir, 230, 90), destination(yvoir, 250, 90)] }),
  ]
  const advice = zoneAdvice(features, [
    { id: 10, type: 'wind', from: 225, to: 270 },
    { id: 11, type: 'cold_wind', from: 22.5, to: 67.5 },
    { id: 12, type: 'fire', from: 135, to: 180 },
  ])
  assert.deepEqual(advice.map((a) => a.kind), ['placement', 'no_wild', 'wind_unsheltered', 'fire_side'])
  assert.deepEqual(advice[0], { kind: 'placement', featureId: 4, elementKind: 'poultry_house', name: null, zone: 4, range: [1, 2], tooFar: true })
  assert.equal((advice[2] as { sectorId: number }).sectorId, 11)
})

test('nothing to say before any zone or house', () => {
  assert.deepEqual(zoneAdvice([feature(4, 'poultry_house', { type: 'Point', coordinates: yvoir })], []), [])
})
