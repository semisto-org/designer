import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayGeometry, isRounded, isZoneKind, nextZoneColor, roundedGeometry, ROUNDING_DEFAULT, ROUNDING_MAX, roundingLevel, ZONE_COLORS, zoneAreaText, zoneLengthText, zoneMeasureText } from '../../../app/frontend/map/zones/zones.ts'

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

// A 50 m square near Yvoir: 2 500 m², like a garden zone.
const LAT = 50.32
const DX = 50 / (111_320 * Math.cos((LAT * Math.PI) / 180))
const DY = 50 / 111_320
const square = { type: 'Polygon', coordinates: [[[4.9, LAT], [4.9 + DX, LAT], [4.9 + DX, LAT + DY], [4.9, LAT + DY], [4.9, LAT]]] }

function areaM2(ring: number[][]): number {
  const kx = 111_320 * Math.cos((LAT * Math.PI) / 180)
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * kx * ring[i + 1][1] * 111_320 - ring[i + 1][0] * kx * ring[i][1] * 111_320
  return Math.abs(sum) / 2
}

test('a rounded zone softens its corners, keeps its ring closed and stays inside the clicked outline', () => {
  const ring = (roundedGeometry(square as never) as { coordinates: number[][][] }).coordinates[0]
  assert.deepEqual(ring[0], ring[ring.length - 1])
  const corners = square.coordinates[0].slice(0, 4).map((p) => p.join(','))
  assert.ok(ring.every((p) => !corners.includes(p.join(','))), 'no corner left')
  const eps = 1e-12
  assert.ok(ring.every(([x, y]) => x >= 4.9 - eps && x <= 4.9 + DX + eps && y >= LAT - eps && y <= LAT + DY + eps), 'inside the clicked outline')
  assert.deepEqual(square.coordinates[0][1], [4.9 + DX, LAT], 'the stored outline is untouched')
})

test('rounding barely changes the area: a few square metres per corner', () => {
  const before = areaM2(square.coordinates[0])
  const after = areaM2((roundedGeometry(square as never) as { coordinates: number[][][] }).coordinates[0])
  assert.ok(Math.abs(before - 2500) < 1)
  assert.ok(before - after > 0 && before - after < 15, `lost ${before - after} m²`)
})

test('a rounded path keeps its two ends', () => {
  const path = { type: 'LineString', coordinates: [[0, 0], [0.001, 0], [0.001, 0.001]] }
  const line = (roundedGeometry(path as never) as { coordinates: number[][] }).coordinates
  assert.deepEqual(line[0], [0, 0])
  assert.deepEqual(line[line.length - 1], [0.001, 0.001])
  assert.ok(line.length > 3)
})

test('any surface that asks for it is rounded, a pond as well as a zone', () => {
  assert.equal(isRounded({ kind: 'zone', rounded: true }), true)
  assert.equal(isRounded({ kind: 'zone' }), false)
  assert.equal(isRounded({ kind: 'pond', rounded: true }), true)
  assert.equal(displayGeometry({ geometry: square as never, properties: { kind: 'pond' } }), square)
  assert.notEqual(displayGeometry({ geometry: square as never, properties: { kind: 'pond', rounded: true } }), square)
})

test('the rounding level defaults to 3 and stays between 1 and 10', () => {
  assert.equal(roundingLevel({}), ROUNDING_DEFAULT)
  assert.equal(roundingLevel({ rounding: 7 }), 7)
  assert.equal(roundingLevel({ rounding: 42 }), ROUNDING_MAX)
  assert.equal(roundingLevel({ rounding: 0 }), 1)
  assert.equal(roundingLevel({ rounding: 'oval' }), ROUNDING_DEFAULT)
})

test('a stronger level rounds more, up to an oval at the strongest', () => {
  const lost = (level: number) => 2500 - areaM2((roundedGeometry(square as never, level) as { coordinates: number[][][] }).coordinates[0])
  assert.deepEqual(roundedGeometry(square as never), roundedGeometry(square as never, ROUNDING_DEFAULT), 'level 3 is the zone default')
  assert.ok(lost(1) < lost(3) && lost(3) < lost(6) && lost(6) < lost(10))
  // Fully rounded, a square loses about 1/6 of its area to its curves (quadratic Bézier corners).
  assert.ok(lost(10) > 300 && lost(10) < 500, `lost ${lost(10)} m²`)
})
