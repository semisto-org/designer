import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canopyShare, crownOverWater, distanceTicks, groundDrop, groundHeight, labelRows, lineParam, noonSunInSection,
  parseLineParam, plantShape, sectionLayout, tallestAt, type SectionData, type SectionPlant,
} from '../../../app/frontend/map/section/section.ts'

const tree = (id: number, d: number, sizes: Partial<Record<'today' | 'year5' | 'year15' | 'year30', { h: number; s: number }>>): SectionPlant => ({
  id, name: `Arbre ${id}`, strata: 'canopy', d, offset: 0, z: 100,
  adult: { h: 20, s: 10 },
  sizes: { today: null, year5: null, year15: null, year30: null, ...sizes },
})

const data = (over: Partial<SectionData> = {}): SectionData => ({
  line: [[4.9, 50.3], [4.9, 50.301]],
  lengthM: 100, corridorM: 6, origin: '2026-01-01',
  moments: [{ key: 'today', year: null, calendarYear: 2026 }],
  relief: 'terrain',
  ground: [{ d: 0, z: 104 }, { d: 50, z: 102 }, { d: 100, z: 100 }],
  plants: [], crossings: [], bearing: 0,
  ...over,
})

test('the ground between samples is read on the straight line joining them; null without relief', () => {
  assert.equal(groundHeight(data(), 25), 103)
  assert.equal(groundHeight(data(), 75), 101)
  assert.equal(groundHeight(data({ ground: [{ d: 0, z: null }, { d: 100, z: null }] }), 40), null)
})

test('heights keep the scale of lengths when the trees fit, and are stretched (and say so) on a long section', () => {
  const short = sectionLayout(data({ lengthM: 40, plants: [tree(1, 10, { year30: { h: 12, s: 8 } })] }), 640, 300)
  assert.ok(short.exaggeration <= 1 + 1e-9)
  const long = sectionLayout(data({ lengthM: 500, plants: [tree(1, 10, { year30: { h: 12, s: 8 } })] }), 640, 300)
  assert.ok(long.exaggeration > 2)
  // The lowest ground sits on the base line, higher ground above it.
  assert.ok(long.y(104) < long.y(100))
})

test('a tree stands on its trunk under an ellipse of crown; a shrub is a dome on the ground', () => {
  const layout = sectionLayout(data(), 640, 300)
  const t = plantShape({ strata: 'canopy', d: 50, z: 102 }, { h: 15, s: 10 }, layout)
  assert.equal(t.kind, 'tree')
  assert.ok(t.trunk > 0)
  assert.ok(Math.abs(t.cy + t.ry - (t.foot - t.trunk)) < 1e-6)
  assert.ok(Math.abs(t.top - (t.foot - 15 * layout.sy)) < 1e-6)
  const s = plantShape({ strata: 'shrub', d: 50, z: 102 }, { h: 2, s: 2 }, layout)
  assert.equal(s.kind, 'dome')
  assert.equal(s.cy, s.foot)
})

test('the canopy closes as crowns grow: overlapping crowns are counted once', () => {
  const d = data({
    plants: [
      tree(1, 20, { year5: { h: 5, s: 4 }, year30: { h: 20, s: 30 } }),
      tree(2, 40, { year5: { h: 5, s: 4 }, year30: { h: 20, s: 30 } }),
    ],
  })
  assert.ok(Math.abs(canopyShare(d, 'year5') - 0.08) < 1e-9)
  // [5, 35] and [25, 55] → 50 m of 100.
  assert.ok(Math.abs(canopyShare(d, 'year30') - 0.5) < 1e-9)
  assert.equal(canopyShare(d, 'today'), 0)
  assert.equal(tallestAt(d, 'year30')?.plant.id, 1)
})

test('a crown reaching over the swale is told; the ground drop and the noon sun follow the line', () => {
  const d = data({
    plants: [tree(1, 20, { year15: { h: 14, s: 12 } })],
    crossings: [{ id: 9, layer: 'water', kind: 'swale', name: 'Baissière', from: 24, to: 24 }],
  })
  assert.equal(crownOverWater(d, 'year15')?.crossing.id, 9)
  assert.equal(crownOverWater(d, 'year5'), null)
  assert.equal(groundDrop(d), 4)
  // Drawn south to north: the noon sun comes from the start, higher in June than in December.
  const sun = noonSunInSection(0, 50.3)
  assert.equal(sun?.from, 'start')
  assert.ok(sun!.june > sun!.december)
  assert.ok(Math.abs(sun!.june - (90 - (50.3 - 23.44))) < 1e-6)
  assert.equal(noonSunInSection(90, 50.3), null)
  assert.equal(noonSunInSection(180, 50.3)?.from, 'end')
})

test('axis ticks are round; labels move to another row rather than overlap', () => {
  assert.deepEqual(distanceTicks(100), [0, 20, 40, 60, 80, 100])
  assert.deepEqual(distanceTicks(37).slice(0, 3), [0, 10, 20])
  assert.deepEqual(labelRows([{ x: 10, width: 40 }, { x: 30, width: 40 }, { x: 100, width: 40 }]), [0, 1, 0])
})

test('the line travels in an editor link and comes back', () => {
  const line: [number, number][] = [[4.9415, 50.3064], [4.9421, 50.3069]]
  assert.deepEqual(parseLineParam(lineParam(line)), line)
  assert.equal(parseLineParam('4.9,50.3'), null)
  assert.equal(parseLineParam('a,b;c,d'), null)
})
