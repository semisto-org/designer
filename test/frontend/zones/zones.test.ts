import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRoundedZone, isZoneKind, nextZoneColor, roundedGeometry, ZONE_COLORS, zoneAreaText, zoneLengthText, zoneMeasureText } from '../../../app/frontend/map/zones/zones.ts'

const nbsp = (text: string) => text.replace(/ | /g, ' ')

test('zones and paths are the generic zone and line kinds', () => {
  assert.equal(isZoneKind('zone'), true)
  assert.equal(isZoneKind('line'), true)
  assert.equal(isZoneKind('pond'), false)
  assert.equal(isZoneKind(undefined), false)
})

test('a new zone takes the least used colour, in palette order', () => {
  assert.equal(nextZoneColor([]), ZONE_COLORS[0])
  assert.equal(nextZoneColor([ZONE_COLORS[0]]), ZONE_COLORS[1])
  assert.equal(nextZoneColor([ZONE_COLORS[0].toUpperCase(), ZONE_COLORS[1], '#123456']), ZONE_COLORS[2])
  assert.equal(nextZoneColor([...ZONE_COLORS, ZONE_COLORS[0]]), ZONE_COLORS[1])
})

test('areas read as on a plan: m² for a bed, ares for a garden, hectares beyond', () => {
  assert.equal(nbsp(zoneAreaText(120.4)), '120 m²')
  assert.equal(nbsp(zoneAreaText(2000)), '20 ares')
  assert.equal(nbsp(zoneAreaText(2050)), '20,5 ares')
  assert.equal(nbsp(zoneAreaText(23_400)), '2,34 ha')
})

test('lengths read in metres, to the decimetre when short', () => {
  assert.equal(nbsp(zoneLengthText(4.26)), '4,3 m')
  assert.equal(nbsp(zoneLengthText(145.4)), '145 m')
  assert.equal(nbsp(zoneLengthText(1250)), '1,25 km')
})

test('the measure under the name follows the kind and can be hidden', () => {
  const measure = { area: 2000, length: 190 }
  assert.equal(nbsp(zoneMeasureText({ kind: 'zone' }, measure)!), '20 ares')
  assert.equal(nbsp(zoneMeasureText({ kind: 'line' }, { area: null, length: 75 })!), '75 m')
  assert.equal(zoneMeasureText({ kind: 'zone', show_measure: false }, measure), null)
  assert.equal(zoneMeasureText({ kind: 'pond' }, measure), null)
  assert.equal(zoneMeasureText({ kind: 'zone' }, { area: null, length: null }), null)
})

test('a rounded zone cuts its corners, keeps its ring closed and stays inside the clicked outline', () => {
  const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }
  const rounded = roundedGeometry(square as never) as { coordinates: number[][][] }
  const ring = rounded.coordinates[0] as number[][]
  assert.equal(ring.length, 4 * 2 ** 3 + 1)
  assert.deepEqual(ring[0], ring[ring.length - 1])
  const corners = ['0,0', '10,0', '10,10', '0,10']
  assert.ok(ring.every((p) => !corners.includes(p.join(','))), 'no corner left')
  assert.ok(ring.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 10), 'inside the clicked outline')
  assert.deepEqual(square.coordinates[0][1], [10, 0], 'the stored outline is untouched')
})

test('a rounded path keeps its two ends', () => {
  const path = { type: 'LineString', coordinates: [[0, 0], [10, 0], [10, 10]] }
  const line = (roundedGeometry(path as never) as { coordinates: number[][] }).coordinates
  assert.deepEqual(line[0], [0, 0])
  assert.deepEqual(line[line.length - 1], [10, 10])
  assert.ok(line.length > 3)
})

test('only zones that ask for it are rounded', () => {
  assert.equal(isRoundedZone({ kind: 'zone', rounded: true }), true)
  assert.equal(isRoundedZone({ kind: 'zone' }), false)
  assert.equal(isRoundedZone({ kind: 'pond', rounded: true }), false)
})
