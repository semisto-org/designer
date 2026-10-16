import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BULKING, capacity, destinationOf, earthworksBalance, excavation, isDiggable, isReceiving, receiverGap, TRUCK_M3, WHEELBARROW_M3,
} from '../../../app/frontend/map/earthworks/earthworks.ts'
import { arrowCurve, arrowsToGeoJSON, bearing } from '../../../app/frontend/map/earthworks/arrows.ts'

const surface = (area: number) => ({ area, length: null })
const line = (length: number) => ({ area: null, length })
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

test('a pond gives back the volume of water it holds, topsoil first', () => {
  const dug = excavation('pond', { depth_m: 1 }, surface(40))!
  close(dug.volume, 20) // 40 m² × 1 m × 0,5 (gentle banks), like the water estimate
  close(dug.topsoil, 20 * (1 - 0.75 ** 2)) // the banks slope: the top 25 cm weigh more than a quarter
  close(dug.subsoil, 20 * 0.75 ** 2)
  close(dug.loose, 20 * BULKING)
  assert.equal(dug.wheelbarrows, Math.ceil(25 / WHEELBARROW_M3))
  assert.equal(dug.trucks, Math.ceil(25 / TRUCK_M3))
})

test('a shallow dig is all topsoil, and the topsoil depth can be changed', () => {
  const shallow = excavation('rain_garden', { depth_m: 0.2 }, surface(10))!
  close(shallow.volume, 2)
  close(shallow.topsoil, 2)
  close(shallow.subsoil, 0)
  const thin = excavation('path', { width_m: 1, dug_depth_m: 0.5, topsoil_cm: 10 }, line(10))!
  close(thin.topsoil, 1) // straight sides: 10 cm of 50
  close(thin.subsoil, 4)
})

test('lines dig length × width × depth; a path digs only with an encaissement', () => {
  close(excavation('swale', { width_m: 1, depth_m: 0.4 }, line(50))!.volume, 10)
  close(excavation('path', { width_m: 1.2, dug_depth_m: 0.5 }, line(20))!.volume, 12)
  assert.equal(excavation('path', { width_m: 1.2 }, line(20)), null)
  assert.equal(excavation('path', { width_m: 1.2, dug_depth_m: 0 }, line(20)), null)
  assert.equal(excavation('pond', {}, surface(40)), null)
  assert.equal(excavation('building', { height_m: 6 }, surface(40)), null)
})

test('which kinds dig and which receive', () => {
  assert.ok(isDiggable('pond') && isDiggable('track') && !isDiggable('mound'))
  assert.ok(isReceiving('mound') && isReceiving('raised_bed') && isReceiving('zone') && !isReceiving('pond'))
  close(capacity('mound', { height_m: 1 }, surface(10))!, 5)
  close(capacity('raised_bed', { height_m: 0.4 }, surface(10))!, 4)
  assert.equal(capacity('zone', {}, surface(10)), null)
})

test('destinations are a feature id or a known keyword', () => {
  assert.equal(destinationOf({ topsoil_to: 12 }, 'topsoil'), 12)
  assert.equal(destinationOf({ subsoil_to: 'berm' }, 'subsoil'), 'berm')
  assert.equal(destinationOf({ subsoil_to: 'moon' }, 'subsoil'), null)
  assert.equal(destinationOf({}, 'topsoil'), null)
})

test('the balance sends each part where it goes and counts what is left undecided', () => {
  const balance = earthworksBalance([
    { id: 1, kind: 'pond', properties: { depth_m: 1, topsoil_to: 3, subsoil_to: 'removed' }, measure: surface(40) },
    { id: 2, kind: 'swale', properties: { width_m: 1, depth_m: 0.4, topsoil_to: 'berm', subsoil_to: 99 }, measure: line(50) },
    { id: 3, kind: 'mound', properties: { height_m: 1 }, measure: surface(30) },
    { id: 4, kind: 'zone', properties: {}, measure: surface(100) },
    { id: 5, kind: 'pond', properties: { depth_m: 1, dug: true, topsoil_to: 4 }, measure: surface(40) },
  ])
  assert.deepEqual(balance.digs.map((d) => d.id), [1, 2]) // the pond already dug is left out
  close(balance.totals.volume, 30)
  const pondTopsoil = 20 * (1 - 0.75 ** 2)
  const swaleTopsoil = 10 * (1 - (0.15 / 0.4) ** 2)
  close(balance.totals.placed, pondTopsoil)
  close(balance.totals.removed, 20 - pondTopsoil)
  close(balance.totals.onSite, swaleTopsoil)
  const mound = balance.receivers.find((r) => r.id === 3)!
  close(mound.received.topsoil, pondTopsoil)
  close(receiverGap(mound)!, 15 - pondTopsoil)
  // A destination that is not a receiver of the map (deleted) counts as undecided.
  assert.equal(balance.digs[1].to.subsoil, null)
  close(balance.totals.undecided, 10 - swaleTopsoil)
  assert.equal(balance.receivers.find((r) => r.id === 4)!.thickness, null)
})

test('soil spread on a zone gives a thickness', () => {
  const balance = earthworksBalance([
    { id: 1, kind: 'pond', properties: { depth_m: 1, topsoil_to: 2, subsoil_to: 2 }, measure: surface(40) },
    { id: 2, kind: 'zone', properties: {}, measure: surface(200) },
  ])
  close(balance.receivers[0].thickness!, 20 / 200)
})

test('arrows bow from the hole to the receiver and point at it', () => {
  const curve = arrowCurve([4.9, 50.3], [4.9, 50.301])
  assert.deepEqual(curve[0], [4.9, 50.3])
  assert.ok(Math.abs(curve[curve.length - 1][1] - 50.301) < 1e-12)
  assert.ok(curve[12][0] < 4.9) // going north, it bows to the west (left)
  close(bearing([0, 0], [0, 1]), 0)
  close(bearing([0, 0], [1, 0]), 90)
  const data = arrowsToGeoJSON([
    { from: [4.9, 50.3], to: [4.901, 50.3], volume: 3, label: '3 m³' },
    { from: [4.9, 50.3], to: [4.9, 50.3], volume: 1, label: 'same place' },
  ])
  assert.deepEqual(data.features.map((f) => f.properties.role), ['line', 'head', 'label'])
  assert.equal(data.features[2].properties.label, '3 m³')
})
