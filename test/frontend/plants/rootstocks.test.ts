import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knownRootstock, rootstocksFor } from '../../../app/frontend/map/plants/rootstocks.ts'

test('a rootstock is found whatever its spelling, and gives its vigour', () => {
  assert.equal(knownRootstock('M9')?.vigor, 'dwarf')
  assert.equal(knownRootstock('m.9')?.vigor, 'dwarf')
  assert.equal(knownRootstock('mm 106')?.name, 'MM106')
  assert.equal(knownRootstock('saint julien a')?.vigor, 'semi_vigorous')
  assert.equal(knownRootstock('cognassier c')?.genus, 'Pyrus')
  assert.equal(knownRootstock('M99'), null)
  assert.equal(knownRootstock(''), null)
  assert.equal(knownRootstock(null), null)
})

test("a species' own rootstocks come first", () => {
  assert.equal(rootstocksFor('Pyrus communis')[0].genus, 'Pyrus')
  assert.equal(rootstocksFor('Prunus avium')[0].genus, 'Prunus')
  assert.equal(rootstocksFor(null).length, rootstocksFor('Malus domestica').length)
})
