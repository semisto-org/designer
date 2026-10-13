import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isZoneKind, nextZoneColor, ZONE_COLORS, zoneAreaText, zoneLengthText, zoneMeasureText } from '../../../app/frontend/map/zones/zones.ts'

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
