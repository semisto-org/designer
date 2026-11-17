import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BULKING, capacity, destinationOf, destinationsOf, earthworksBalance, excavation, isDiggable, isReceiving, receiverGap, storedDestinations, TRUCK_M3, WHEELBARROW_M3,
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
  assert.deepEqual(balance.digs[1].to.subsoil, [])
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

test('several destinations: read from a single value or a list, stored back the shortest way', () => {
  assert.deepEqual(destinationsOf({ topsoil_to: 12 }, 'topsoil'), [{ to: 12, m3: null }])
  assert.deepEqual(destinationsOf({ topsoil_to: [{ to: 12 }, { to: 'berm', m3: 3 }, { to: 12 }, { to: 'moon' }, 7] }, 'topsoil'),
    [{ to: 12, m3: null }, { to: 'berm', m3: 3 }, { to: 7, m3: null }])
  assert.equal(destinationOf({ subsoil_to: [{ to: 4 }, { to: 5 }] }, 'subsoil'), 4)
  assert.equal(storedDestinations([]), null)
  assert.equal(storedDestinations([{ to: 12, m3: null }]), 12)
  assert.deepEqual(storedDestinations([{ to: 12, m3: null }, { to: 14, m3: 2.345 }]), [{ to: 12 }, { to: 14, m3: 2.35 }])
})

test('a pond feeding two mounds fills them according to the room left in each', () => {
  // Walhain: one pond, its subsoil shared between two mounds of 10 and 30 m³.
  const balance = earthworksBalance([
    { id: 1, kind: 'pond', properties: { depth_m: 1, topsoil_cm: 0, subsoil_to: [{ to: 2 }, { to: 3 }] }, measure: surface(40) },
    { id: 2, kind: 'mound', properties: { height_m: 1 }, measure: surface(20) },
    { id: 3, kind: 'mound', properties: { height_m: 1 }, measure: surface(60) },
  ])
  const [small, big] = balance.digs[0].to.subsoil
  close(small.volume, 5) // 20 m³ shared 10 : 30
  close(big.volume, 15)
  assert.equal(small.fixed, false)
  close(balance.totals.placed, 20)
  close(balance.totals.undecided, 0)
})

test('a fixed volume goes first, the rest by room, and the overflow to a destination without capacity', () => {
  const balance = earthworksBalance([
    { id: 1, kind: 'pond', properties: { depth_m: 1, topsoil_cm: 0, subsoil_to: [{ to: 2, m3: 4 }, { to: 3 }, { to: 'spread' }] }, measure: surface(80) },
    { id: 2, kind: 'mound', properties: { height_m: 1 }, measure: surface(20) },
    { id: 3, kind: 'mound', properties: { height_m: 1 }, measure: surface(20) },
  ])
  const shares = balance.digs[0].to.subsoil
  close(shares[0].volume, 4)
  assert.equal(shares[0].fixed, true)
  close(shares[1].volume, 10) // mound 3 filled to the brim
  close(shares[2].volume, 40 - 4 - 10) // the rest spread on site
  close(balance.totals.onSite, 26)
})

test('a second pond sees the room the first one already took', () => {
  const balance = earthworksBalance([
    { id: 1, kind: 'pond', properties: { depth_m: 1, topsoil_cm: 0, subsoil_to: 3 }, measure: surface(12) },
    { id: 2, kind: 'pond', properties: { depth_m: 1, topsoil_cm: 0, subsoil_to: [{ to: 3 }, { to: 4 }] }, measure: surface(20) },
    { id: 3, kind: 'mound', properties: { height_m: 1 }, measure: surface(20) },
    { id: 4, kind: 'mound', properties: { height_m: 1 }, measure: surface(20) },
  ])
  const [first, second] = balance.digs[1].to.subsoil
  close(first.volume, 10 * (4 / 14)) // mound 3 has 4 m³ left, mound 4 has 10
  close(second.volume, 10 * (10 / 14))
})

test('fixed volumes that fall short leave the rest undecided', () => {
  const balance = earthworksBalance([
    { id: 1, kind: 'pond', properties: { depth_m: 1, topsoil_cm: 0, subsoil_to: [{ to: 2, m3: 6 }] }, measure: surface(40) },
    { id: 2, kind: 'mound', properties: { height_m: 1 }, measure: surface(40) },
  ])
  close(balance.digs[0].undecided.subsoil, 14)
  close(balance.totals.undecided, 14)
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

test('a graded terrace sends what its own fill cannot take, or asks for what it lacks', () => {
  const balance = earthworksBalance([
    { id: 1, kind: 'graded_terrace', properties: { grading: { cut_m3: 30, fill_m3: 10 }, subsoil_to: 2 }, measure: surface(100) },
    { id: 2, kind: 'graded_profile', properties: { grading: { cut_m3: 5, fill_m3: 25 } }, measure: line(30) },
  ])
  const dig = balance.digs.find((d) => d.id === 1)!
  close(dig.excavation.volume, 20)
  close(dig.excavation.topsoil, 0) // the topsoil goes back on the terrace
  const bank = balance.receivers.find((r) => r.id === 2)!
  close(bank.capacity!, 20)
  close(bank.received.subsoil, 20)
  close(receiverGap(bank)!, 0)
  // Without volumes (no relief yet), nothing to count.
  assert.equal(excavation('graded_terrace', {}, surface(100)), null)
})

test('a patio on a slope counts its cut and fill like a graded terrace', () => {
  const balance = earthworksBalance([{ id: 1, kind: 'terrace', properties: { surface: 'wood', grading: { cut_m3: 6, fill_m3: 4 } }, measure: surface(30) }])
  close(balance.digs[0].excavation.volume, 2)
  assert.equal(excavation('terrace', { surface: 'wood' }, surface(30)), null)
})
