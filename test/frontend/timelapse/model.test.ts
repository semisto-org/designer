import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import {
  BEDS, CHAPTERS, HEDGE, PARCEL, PLANTED, POND, SPECIES, TRAILS, TREES, UNDERSTOREY,
  birdLanes, birdsAt, calendar, canopyCover, crownPx, distToEdge, distToLine, distToPaths, fishAt, insidePolygon, seasonAt, stateAt,
} from '../../../app/frontend/components/site/timelapse/model.ts'

test('every chapter of the copy has its moment in the model, and the other way round', () => {
  const yml = parse(readFileSync(new URL('../../../config/locales/site.fr.yml', import.meta.url), 'utf8'))
  assert.equal(yml.fr.site.home.story.chapters.length, CHAPTERS.length)
  assert.equal(yml.fr.site.home.story.months.length, 12)
})

test('chapters move forward in time and planting comes before the first spring', () => {
  for (let i = 1; i < CHAPTERS.length; i++) assert.ok(CHAPTERS[i].t >= CHAPTERS[i - 1].t, `chapter ${i}`)
  const planting = CHAPTERS.findIndex((c) => c.plan)
  assert.equal(CHAPTERS[planting].t, PLANTED)
  assert.ok(CHAPTERS[planting + 1].t > PLANTED)
})

test('the seasons of a temperate year', () => {
  const january = seasonAt(0.02)
  const june = seasonAt(30.45)
  const april = seasonAt(1.31)
  const october = seasonAt(15.78)
  assert.ok(january.snow > 0.9 && january.leaf === 0)
  assert.ok(june.leaf === 1 && june.snow === 0 && june.autumn === 0)
  assert.ok(april.blossom > 0.9)
  assert.ok(october.autumn > 0.9 && october.leaf > 0.5)
  assert.ok(january.shadow > june.shadow, 'winter shadows are longer')
})

test('trees grow from nothing to their adult crown', () => {
  assert.equal(crownPx('noyer', -1), 0)
  assert.ok(crownPx('noyer', 1) < crownPx('noyer', 15))
  assert.ok(crownPx('noyer', 30) <= 9 * 12.5)
  assert.ok(crownPx('noyer', 30) > 8 * 12.5, 'a walnut is nearly grown at 30')
  assert.ok(crownPx('cassis', 5) > 0.8 * 0.9 * 12.5, 'a blackcurrant is grown in a few years')
})

test('the canopy closes over the years', () => {
  const at1 = canopyCover(1)
  const at15 = canopyCover(15)
  const at30 = canopyCover(30)
  assert.ok(at1 < 0.02)
  assert.ok(at15 > at1 && at30 > at15)
  assert.ok(at30 < 0.7, 'room is left for the pond, the path and the vegetable beds')
})

test('every tree is planted inside the terrain', () => {
  for (const t of TREES) assert.ok(insidePolygon(t.x, t.y, PARCEL), `${t.sp} at ${t.x},${t.y}`)
})

test('the hedge runs all round the terrain, just inside it', () => {
  assert.ok(HEDGE.length > 80)
  for (const h of HEDGE) {
    assert.ok(insidePolygon(h.x, h.y, PARCEL), `${h.sp} at ${h.x},${h.y}`)
    assert.ok(distToEdge(h.x, h.y) < 20, `${h.sp} at ${h.x},${h.y}`)
    assert.equal(SPECIES[h.sp].kind, 'hedge')
  }
})

test('the understorey is dense, and keeps off the paths, the pond and the beds', () => {
  const herbs = UNDERSTOREY.filter((p) => SPECIES[p.sp].kind === 'herb')
  const shrubs = UNDERSTOREY.filter((p) => SPECIES[p.sp].kind === 'shrub')
  assert.ok(herbs.length > 300 && shrubs.length > 60, `${herbs.length} herbs, ${shrubs.length} shrubs`)
  for (const p of UNDERSTOREY) {
    assert.ok(insidePolygon(p.x, p.y, PARCEL), `${p.sp} at ${p.x},${p.y}`)
    assert.ok(distToPaths(p.x, p.y) >= (SPECIES[p.sp].kind === 'herb' ? 9 : 24), `${p.sp} on a path at ${p.x},${p.y}`)
    assert.ok(Math.hypot(p.x - POND.x, p.y - POND.y) > POND.r, `${p.sp} in the pond`)
    for (const [x, y, w, h] of BEDS) assert.ok(!(p.x > x && p.x < x + w && p.y > y && p.y < y + h), `${p.sp} in a bed`)
  }
  for (const h of herbs) assert.ok(h.delay !== undefined && h.delay > 0 && h.delay < 2, 'ground covers spread in the first two years')
})

test('the tall trees stand to the north, the paths run between the trees', () => {
  const y = (sp: string[]) => TREES.filter((t) => sp.includes(t.sp)).reduce((a, t, _, all) => a + t.y / all.length, 0)
  assert.ok(y(['chataignier', 'aulne']) < y(['pommier', 'poirier', 'cerisier']), 'chestnut and alders north of the fruit trees')
  for (const t of TREES) assert.ok(TRAILS.every((trail) => distToLine(t.x, t.y, trail) > 20), `${t.sp} at ${t.x},${t.y} stands on a path`)
})

test('birds come by more often as the garden grows, never in a crowd, and fish once the pond has aged', () => {
  assert.equal(birdLanes(-0.5), 1)
  assert.ok(birdLanes(5) > birdLanes(1) && birdLanes(30) > birdLanes(5))
  let early = 0
  let late = 0
  for (let t = 0; t < 900; t += 0.5) {
    early += birdsAt(t, 0.5).length
    const now = birdsAt(t, 29)
    late += now.length
    assert.ok(now.length <= 3)
  }
  assert.ok(early > 0 && late > early * 2, `${early} early, ${late} late`)
  assert.deepEqual(birdsAt(42.5, 12), birdsAt(42.5, 12), 'a flight is the same on every frame')
  for (let t = 0; t < 300; t += 0.5) assert.equal(fishAt(t, 2).length, 0)
  assert.ok(Array.from({ length: 600 }, (_, i) => fishAt(i * 0.5, 8).length).some((n) => n > 0))
})

test('the calendar names the month, the year and the garden year', () => {
  assert.deepEqual(calendar(0), { year: 2026, month: 0, gardenYear: 0, stage: 'bare' })
  assert.equal(calendar(0.32).stage, 'observe')
  assert.equal(calendar(PLANTED + 0.1).stage, 'planting')
  assert.deepEqual(calendar(15.78), { year: 2041, month: 9, gardenYear: 15, stage: 'growing' })
})

test('the scroll holds on a chapter, then time runs to the next one', () => {
  const tops = CHAPTERS.map((_, i) => i * 1000)
  const held = stateAt(tops, 4000 + 200, 800)
  assert.equal(held.chapter, 4)
  assert.equal(held.tau, CHAPTERS[4].t)
  const between = stateAt(tops, 4000 + 800, 800)
  assert.ok(between.tau > CHAPTERS[4].t && between.tau < CHAPTERS[5].t)
  const end = stateAt(tops, 99999, 800)
  assert.equal(end.chapter, CHAPTERS.length - 1)
  assert.equal(end.zoom, CHAPTERS[CHAPTERS.length - 1].zoom)
  assert.equal(stateAt(tops, 8100, 800).plantMode, true)
  assert.equal(stateAt(tops, 4100, 800).plantMode, false)
})
