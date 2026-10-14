import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fold, isSwitcherShortcut, searchMaps, type SwitcherMap } from '../../../app/frontend/quick_switcher/match.ts'

const map = (id: number, name: string, extra: Partial<SwitcherMap> = {}): SwitcherMap => ({
  id, name, address: null, stage: 'observe', role: 'owner', teamName: null, updatedAt: '2026-10-14T10:00:00Z', ...extra,
})

const maps = [
  map(1, "Domaine d'Ahinvaux", { address: 'Yvoir, Belgique' }),
  map(2, 'Jardin de la Wallonie picarde'),
  map(3, 'Walhain'),
  map(4, 'Verger des Écoles', { teamName: 'Bureau Wallon' }),
]

test('folding drops accents and case, keeping every index', () => {
  assert.equal(fold('Écoles Été'), 'ecoles ete')
  assert.equal(fold('Œuf').length, 'Œuf'.length)
})

test('a name starting with the text comes first, then a word that starts with it', () => {
  assert.deepEqual(searchMaps(maps, 'Wal').map((m) => m.map.id), [3, 2, 4])
})

test('accents and case do not matter', () => {
  assert.deepEqual(searchMaps(maps, 'ecoles').map((m) => m.map.id), [4])
  assert.deepEqual(searchMaps(maps, 'ÉCOL').map((m) => m.map.id), [4])
})

test('every word must be found, in the name or the place', () => {
  assert.deepEqual(searchMaps(maps, 'domaine yvoir').map((m) => m.map.id), [1])
  assert.deepEqual(searchMaps(maps, 'domaine namur').map((m) => m.map.id), [])
})

test('the matched part of the name is given for highlighting', () => {
  const [walhain] = searchMaps(maps, 'hain')
  assert.deepEqual(walhain.highlight, [3, 7])
})

test('nothing typed lists the maps in their order', () => {
  assert.deepEqual(searchMaps(maps, '  ').map((m) => m.map.id), [1, 2, 3, 4])
})

test('Cmd+J and Ctrl+J open it, not J alone nor with Shift', () => {
  const key = { key: 'j', code: 'KeyJ', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }
  assert.equal(isSwitcherShortcut({ ...key, metaKey: true }), true)
  assert.equal(isSwitcherShortcut({ ...key, ctrlKey: true }), true)
  assert.equal(isSwitcherShortcut(key), false)
  assert.equal(isSwitcherShortcut({ ...key, ctrlKey: true, shiftKey: true }), false)
})
