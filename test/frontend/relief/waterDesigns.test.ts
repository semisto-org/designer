import { test } from 'node:test'
import assert from 'node:assert/strict'
import { waterDesigns } from '../../../app/frontend/relief/waterDesigns.ts'
import { designsKey } from '../../../app/frontend/relief/mapOverlay.ts'
import { analyzeDrainage } from '../../../app/frontend/relief/hydro.ts'
import { applyDesigns } from '../../../app/frontend/relief/design.ts'
import { toLngLat } from '../../../app/frontend/relief/grid.ts'

// A 20 × 20 grid of 1 m cells (Web Mercator metres from the origin).
const meta = { west: 0, north: 0, step: 1, cols: 20, rows: 20, cellSizeM: 1 }
const at = (x: number, y: number) => toLngLat(meta, { x, y })
const feature = (properties: Record<string, unknown>, geometry: unknown) => ({ type: 'Feature', properties, geometry }) as never

test('ponds, swales and barriers become designs; drafts and other kinds do not', () => {
  const { designs, strips, effects } = waterDesigns(meta, [
    feature({ id: 1, kind: 'pond', status: 'active' }, { type: 'Polygon', coordinates: [[at(2, 2), at(6, 2), at(6, 6), at(2, 6), at(2, 2)]] }),
    feature({ id: 2, kind: 'swale', status: 'active' }, { type: 'LineString', coordinates: [at(1, 10), at(18, 10)] }),
    feature({ id: 3, kind: 'hedge_bank', status: 'active' }, { type: 'LineString', coordinates: [at(1, 14), at(18, 14)] }),
    feature({ id: 4, kind: 'pond', status: 'draft' }, { type: 'Polygon', coordinates: [[at(10, 2), at(14, 2), at(14, 6), at(10, 2)]] }),
    feature({ id: 5, kind: 'keyline', use: 'trees' }, { type: 'LineString', coordinates: [at(1, 16), at(18, 16)] }),
    feature({ id: 6, kind: 'tree' }, { type: 'Point', coordinates: at(3, 3) }),
    feature({ id: 7, kind: 'grass_strip' }, { type: 'Polygon', coordinates: [[at(1, 18), at(18, 18), at(18, 19), at(1, 18)]] }),
  ])
  assert.deepEqual(designs.map((d) => [d.id, d.type]), [[1, 'pond'], [2, 'swale'], [3, 'barrier']])
  assert.deepEqual(strips.map((s) => s.id), [7])
  assert.ok(effects.has(3))
  const pond = designs[0] as { ring: { x: number; y: number }[] }
  assert.ok(Math.abs(pond.ring[1].x - 6) < 0.05 && Math.abs(pond.ring[1].y - 2) < 0.05)
})

test('a swale across the slope changes where the water drains', () => {
  // A plane falling to the south (y grows downhill).
  const heights = Float32Array.from({ length: 400 }, (_, i) => 100 - Math.floor(i / 20) * 0.5)
  const { designs } = waterDesigns(meta, [
    feature({ id: 1, kind: 'swale' }, { type: 'LineString', coordinates: [at(2, 10), at(17, 10)] }),
  ])
  const natural = analyzeDrainage(heights, 20, 20, 1).accumulation
  const dug = analyzeDrainage(applyDesigns(heights, 20, 20, 1, designs).heights, 20, 20, 1).accumulation
  assert.notDeepEqual(Array.from(dug), Array.from(natural))
})

test('the cache key follows the works, and is empty without any', () => {
  assert.equal(designsKey([]), '')
  const a = waterDesigns(meta, [feature({ id: 1, kind: 'swale' }, { type: 'LineString', coordinates: [at(2, 10), at(17, 10)] })]).designs
  const b = waterDesigns(meta, [feature({ id: 1, kind: 'swale' }, { type: 'LineString', coordinates: [at(2, 11), at(17, 11)] })]).designs
  assert.notEqual(designsKey(a), '')
  assert.notEqual(designsKey(a), designsKey(b))
  assert.equal(designsKey(a), designsKey(structuredClone(a)))
})

test('mounds and raised beds are heaped; a tank counts the roofs whose gutter reaches it', () => {
  const roof = [[at(2, 2), at(12, 2), at(12, 7), at(2, 7), at(2, 2)]]
  const { designs, tanks } = waterDesigns(meta, [
    feature({ id: 1, kind: 'mound', height_m: 1.2 }, { type: 'Polygon', coordinates: [[at(2, 10), at(8, 10), at(8, 16), at(2, 10)]] }),
    feature({ id: 2, kind: 'raised_bed' }, { type: 'Polygon', coordinates: [[at(10, 10), at(14, 10), at(14, 12), at(10, 10)]] }),
    feature({ id: 3, kind: 'building' }, { type: 'Polygon', coordinates: roof }),
    feature({ id: 4, kind: 'water_tank', capacity_l: 3000 }, { type: 'Point', coordinates: at(14, 4) }),
    feature({ id: 5, kind: 'water_pipe', from_id: 3, to_id: 4 }, { type: 'LineString', coordinates: [at(12, 4), at(14, 4)] }),
    feature({ id: 6, kind: 'water_tank' }, { type: 'Point', coordinates: at(18, 18) }),
  ])
  assert.deepEqual(designs.map((d) => [d.id, d.type, (d as { height?: number }).height, (d as { profile?: string }).profile]),
    [[1, 'mound', 1.2, 'dome'], [2, 'mound', 0.4, 'flat']])
  assert.equal(tanks.length, 2)
  assert.equal(tanks[0].capacity, 3)
  assert.ok(Math.abs(tanks[0].roofArea - 50) < 1, `roof ${tanks[0].roofArea}`)
  assert.deepEqual([tanks[1].capacity, tanks[1].roofArea], [5, 0])
})
