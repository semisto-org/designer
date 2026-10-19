import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  allAround, arcPath, bearing, compassPoint, labelReversed, packRings, sectorArc, sectorDirections, sectorRange, shorterWay, sunSectors, sweep,
} from '../../../app/frontend/map/sectors/sectors.ts'

const yvoir = [4.88, 50.33]

test('bearings are clockwise from north', () => {
  assert.equal(Math.round(bearing(yvoir, [4.88, 50.34])), 0)
  assert.equal(Math.round(bearing(yvoir, [4.89, 50.33])), 90)
  assert.equal(Math.round(bearing(yvoir, [4.88, 50.32])), 180)
  assert.equal(Math.round(bearing(yvoir, [4.87, 50.33])), 270)
  assert.equal(compassPoint(135), 'SE')
  assert.equal(compassPoint(350), 'N')
  assert.equal(compassPoint(247.5), 'OSO')
})

test('an arc drawn around the centre gives back its directions, across north too', () => {
  const arc = sectorArc(yvoir, 80, 300, 40)
  assert.deepEqual(sectorRange(arc, yvoir), { from: 300, to: 40 })
  assert.equal(sweep(300, 40), 100)
  assert.equal(sweep(90, 90), 360)
})

test('the summer sun sweeps from the north-east to the north-west, the winter sun only the south', () => {
  const [summer, winter] = sunSectors(50.33)
  assert.equal(summer.type, 'summer_sun')
  assert.ok(summer.from > 45 && summer.from < 60, `summer sunrise ${summer.from}`)
  assert.equal(summer.to, 360 - summer.from)
  assert.ok(winter.from > 120 && winter.from < 135, `winter sunrise ${winter.from}`)
  assert.ok(sweep(winter.from, winter.to) < sweep(summer.from, summer.to))
  assert.deepEqual(sunSectors(80), [])
  // South of the equator the sun passes through the north.
  const [southSummer] = sunSectors(-34)
  assert.ok(sweep(southSummer.from, southSummer.to) > 180 && southSummer.from > 180)
})

test('short arcs go inside, overlapping arcs on separate rings, others share', () => {
  const rings = packRings([
    { from: 50, to: 310 }, // summer sun
    { from: 130, to: 230 }, // winter sun
    { from: 170, to: 200 }, // noise from the road
    { from: 20, to: 60 }, // views, apart from the noise
  ])
  assert.equal(rings[2], 0)
  assert.equal(rings[3], 0)
  assert.equal(rings[1], 1)
  assert.equal(rings[0], 2)
})

test('labels on the lower half run anticlockwise to read right side up', () => {
  assert.equal(labelReversed(150, 210), true)
  assert.equal(labelReversed(300, 60), false)
  assert.match(arcPath(100, 100, 50, 0, 90), /^M 100.00 50.00 A 50 50 0 0 1 150.00 100.00$/)
  assert.match(arcPath(100, 100, 50, 0, 90, true), /^M 150.00 100.00 A 50 50 0 0 0 100.00 50.00$/)
})

test('the sector page keeps the outer ring inside the picture and the terrain inside the first ring', async () => {
  const { sectorLayout, toPixels, farthestM } = await import('../../../app/frontend/map/sectors/sectors.ts')
  const layout = sectorLayout({ width: 820, height: 794, rings: 4, terrainRadiusM: 90 })
  assert.ok(layout.radius(3) + layout.stroke / 2 < 794 / 2)
  assert.ok(90 / layout.metersPerPx < layout.radius(0) - layout.stroke / 2)
  const [x, y] = toPixels(yvoir, [4.88, 50.331], 1)
  assert.equal(Math.round(x), 0)
  assert.equal(Math.round(y), -111)
  assert.equal(Math.round(farthestM(yvoir, [[4.88, 50.331], [4.8801, 50.33]])), 111)
})

test('saved directions win over the arc, which follows a centre that can move', () => {
  const arc = sectorArc(yvoir, 80, 300, 40)
  const moved = [4.881, 50.331]
  assert.deepEqual(sectorDirections({ from_deg: 300, to_deg: 40 }, arc, moved), { from: 300, to: 40 })
  assert.deepEqual(sectorDirections({}, arc, yvoir), { from: 300, to: 40 })
})

test('two picked directions join the shorter way, and a sector can go all around', () => {
  assert.deepEqual(shorterWay(315, 225), { from: 225, to: 315 })
  assert.deepEqual(shorterWay(300, 40), { from: 300, to: 40 })
  assert.ok(allAround(0, 0))
  assert.ok(!allAround(0, 90))
  assert.deepEqual(sectorRange(sectorArc(yvoir, 80, 0, 0), yvoir), { from: 0, to: 0 })
})
