import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byRecent, distance, fold, isSwitcherShortcut, rememberOpened, searchMaps, searchPages, type SwitcherMap } from '../../../app/frontend/quick_switcher/match.ts'

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

test('a slip of the finger or the initials still find the map, after exact matches', () => {
  assert.deepEqual(searchMaps(maps, 'walhian').map((m) => m.map.id), [3])
  const more = [...maps, map(5, 'Jardin-forêt de Gembloux')]
  assert.deepEqual(searchMaps(more, 'jfg').map((m) => m.map.id), [5])
  assert.deepEqual(searchMaps(more, 'gemblou').map((m) => m.map.id), [5])
  assert.equal(searchMaps(more, 'walhian')[0].highlight, null)
})

test('distance counts one swap as one slip', () => {
  assert.equal(distance('walhian', 'walhain'), 1)
  assert.equal(distance('abc', 'xyz'), 2)
})

test('maps opened lately come first, the latest on top', () => {
  let recent: number[] = []
  recent = rememberOpened(recent, 3)
  recent = rememberOpened(recent, 4)
  recent = rememberOpened(recent, 3)
  assert.deepEqual(recent, [3, 4])
  assert.deepEqual(byRecent(maps, recent).map((m) => m.id), [3, 4, 1, 2])
})

test('pages are offered only for what is typed', () => {
  const pages = [
    { key: 'tasks', label: 'Tâches', href: '/tasks' },
    { key: 'new', label: 'Nouvelle carte', href: '/maps/new', keywords: 'créer ajouter' },
  ]
  assert.deepEqual(searchPages(pages, ''), [])
  assert.deepEqual(searchPages(pages, 'tach').map((p) => p.key), ['tasks'])
  assert.deepEqual(searchPages(pages, 'creer').map((p) => p.key), ['new'])
})
