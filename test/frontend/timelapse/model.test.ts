import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import {
  CHAPTERS, PARCEL, PLANTED, TREES, calendar, canopyCover, crownPx, insidePolygon, seasonAt, stateAt,
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
