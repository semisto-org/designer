import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { inWinter, PLATE_COLORS, STRATA_PLATES, wintersInGround } from '../../../app/frontend/components/plants/specimen.ts'
import { PLAN_STRATA_COLORS } from '../../../app/frontend/map/plants/strataColors.ts'
import { STRATA } from '../../../app/frontend/types/plants.ts'

test('counts the mid-winters a plant has lived through in the ground', () => {
  assert.equal(wintersInGround('2024-11-28', null, '2026-11-21'), 2)
  assert.equal(wintersInGround('2025-03-10', null, '2026-11-21'), 1)
  assert.equal(wintersInGround('2026-03-10', null, '2026-11-21'), 0)
  assert.equal(wintersInGround('2025-12-01', null, '2026-01-15'), 1)
  assert.equal(wintersInGround('2025-12-01', null, '2026-01-14'), 0)
})

test('a planting known by its year counts from mid-year; an unknown date has no age', () => {
  assert.equal(wintersInGround('2015-01-01', 'year', '2026-11-21'), 11)
  assert.equal(wintersInGround('2024-01-01', 'unknown', '2026-11-21'), null)
})

test('winter is December to February', () => {
  assert.equal(inWinter('2026-12-03'), true)
  assert.equal(inWinter('2027-02-28'), true)
  assert.equal(inWinter('2026-11-21'), false)
})

test('every strata has a plate, painted in its presentation watercolour', () => {
  for (const strata of STRATA) {
    assert.ok(STRATA_PLATES[strata]?.some((m) => m.kind === 'wash'), strata)
    assert.equal(PLATE_COLORS[strata], PLAN_STRATA_COLORS[strata], strata)
  }
})

test('the phone keeps a twin of the file, word for word', () => {
  const web = readFileSync(new URL('../../../app/frontend/components/plants/specimen.ts', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../../../mobile/src/lib/specimen.ts', import.meta.url), 'utf8')
  assert.equal(app, web)
})
