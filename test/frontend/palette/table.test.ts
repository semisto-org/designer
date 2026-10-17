import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyFilters, cellValue, crownArea, groupRows, normalizeSettings, sameSettings, sortRows, statusOf, toCsv, totals, UNTAGGED, viewGroups,
  type PaletteRow,
} from '../../../app/frontend/palette/table.ts'

const slot = (planned: number, planted = 0, existing = 0) => ({ existing, planned, planted, placed: planned, patches: 0 })

function row(over: Partial<PaletteRow>): PaletteRow {
  return {
    key: 'k', speciesId: 1, varietyId: null, paletteItemId: null, inPalette: false, name: 'Pommier', commonName: 'Pommier',
    latinName: 'Malus domestica', varietyName: null, strata: 'sub_canopy', plantType: 'tree', existing: 0, planned: 0, isolated: 0,
    composed: 0, placed: 0, planted: 0, patches: 0, exposures: [], floweringMonths: [], harvestMonths: [], tags: [],
    survival: { established: 0, struggling: 0, dead: 0 }, byTag: {}, untagged: slot(0), ...over,
  }
}

const apple = row({ key: 'a', name: 'Pommier', planned: 10, planted: 4, unitPrice: 12.5, supplier: 'Bocq', role: 'food', tags: ['Mars'], byTag: { Mars: slot(6, 4) }, untagged: slot(4) })
const hazel = row({ key: 'h', name: 'Noisetier', latinName: 'Corylus avellana', strata: 'shrub', planned: 5, unitPrice: 3, supplier: 'bocq', untagged: slot(5) })
const oak = row({ key: 'existing:Vieux chêne', speciesId: null, name: 'Vieux chêne', latinName: null, strata: 'canopy', existing: 2, spreadM: 10 })
const alder = row({ key: 'al', name: 'Aulne', strata: 'canopy', inPalette: true })
const rows = [apple, hazel, oak, alder]
const base = normalizeSettings({ columns: ['name', 'planned'], group_by: 'none' })

test('a plant reads its place in the project from its quantities', () => {
  assert.equal(statusOf(oak), 'existing')
  assert.equal(statusOf(alder), 'chosen')
  assert.equal(statusOf(hazel), 'planned')
  assert.equal(statusOf(apple), 'planting')
  assert.equal(statusOf({ existing: 0, planned: 3, planted: 3 }), 'planted')
})

test('computed columns: what remains to plant and to buy', () => {
  assert.equal(cellValue(apple, 'to_plant'), 6)
  assert.equal(cellValue(apple, 'amount'), 125)
  assert.equal(cellValue(apple, 'amount_to_plant'), 75)
  assert.equal(cellValue(alder, 'amount'), null)
  assert.deepEqual(totals([apple, hazel], ['name', 'planned', 'amount_to_plant']), { planned: 15, amount_to_plant: 90 })
})

test('filters: status, search without accents, supplier whatever its case, what remains to plant', () => {
  assert.deepEqual(applyFilters(rows, { ...base.filters, statuses: ['planned', 'planting'] }).map((r) => r.key), ['a', 'h'])
  assert.deepEqual(applyFilters(rows, { ...base.filters, search: 'chene' }).map((r) => r.key), ['existing:Vieux chêne'])
  assert.deepEqual(applyFilters(rows, { ...base.filters, supplier: 'BOCQ' }).map((r) => r.key), ['a', 'h'])
  assert.deepEqual(applyFilters(rows, { ...base.filters, to_plant_only: true }).map((r) => r.key), ['a', 'h'])
})

test('a tag filter shows that planting day\'s quantities only', () => {
  const scoped = applyFilters(rows, { ...base.filters, tag: 'mars' })
  assert.deepEqual(scoped.map((r) => [r.key, r.planned, r.planted]), [['a', 6, 4]])
  const untagged = applyFilters(rows, { ...base.filters, untagged: true })
  assert.deepEqual(untagged.map((r) => [r.key, r.planned]), [['a', 4], ['h', 5]])
})

test('groups: strata from the canopy down, suppliers merged whatever their case, empty last', () => {
  assert.deepEqual(groupRows(rows, 'strata', []).map((g) => g.key), ['canopy', 'sub_canopy', 'shrub'])
  const bySupplier = groupRows(rows, 'supplier', [])
  assert.deepEqual(bySupplier.map((g) => [g.key, g.rows.length]), [['Bocq', 2], [null, 2]])
  const byTag = groupRows(rows, 'tag', ['Mars'])
  assert.deepEqual(byTag.map((g) => [g.key, g.rows.map((r) => r.planned)]), [['Mars', [6]], [null, [4, 5]]])
})

test('sort keeps empty cells at the bottom in both directions', () => {
  assert.deepEqual(sortRows(rows, { key: 'unit_price', dir: 'desc' }).map((r) => r.key).slice(0, 2), ['a', 'h'])
  assert.deepEqual(sortRows(rows, { key: 'unit_price', dir: 'asc' }).map((r) => r.key).slice(0, 2), ['h', 'a'])
  assert.deepEqual(sortRows(rows, { key: 'name', dir: 'asc' }).map((r) => r.name), ['Aulne', 'Noisetier', 'Pommier', 'Vieux chêne'])
})

test('settings: name always first, missing filters filled, compared by content', () => {
  const s = normalizeSettings({ columns: ['planned', 'name'], filters: { to_plant_only: true } })
  assert.deepEqual(s.columns, ['name', 'planned'])
  assert.equal(s.filters.tag, null)
  assert.ok(sameSettings(s, normalizeSettings({ columns: ['name', 'planned'], filters: { to_plant_only: true } })))
  assert.ok(!sameSettings(s, base))
  assert.notEqual(UNTAGGED, '')
})

test('CSV for a French spreadsheet: BOM, semicolons, quoted cells', () => {
  const groups = viewGroups([apple], base, [])
  const csv = toCsv(groups, ['name', 'notes'], (c) => c, (r, c) => (c === 'notes' ? 'Sol ; humide' : r.name))
  assert.equal(csv, '﻿name;notes\r\nPommier;"Sol ; humide"\r\n')
})

test('crowns grow with the years and existing trees already count', () => {
  const young = row({ strata: 'sub_canopy', planned: 4, spreadM: 5, maturityYears: 12 })
  const at = (years: number) => crownArea([young, oak], years)
  assert.ok(at(1) < at(5) && at(5) < at(15) && at(15) <= at(30))
  assert.ok(crownArea([oak], 1) > 150)
})
