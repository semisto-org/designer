import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The editor opens with the map, not with every tool: panels and inspector
// sections are fetched when they first show (map/panels/deferred.tsx). On an
// old laptop, parsing them all up front held the map back by seconds.
const index = readFileSync(new URL('../../../app/frontend/map/panels/index.ts', import.meta.url), 'utf8')
const [, registries] = index.split('// Register editor panels here')
const [panelsAndSections] = registries.split('// Top bar actions')

test('every panel and inspector section is deferred', () => {
  const eager = [...panelsAndSections.matchAll(/component: (?!deferred\()(\w+)/g)].map((m) => m[1])
  assert.deepEqual(eager, [], 'register them as component: deferred(() => import(...))')
})

test('no panel or section is imported statically by the registry', () => {
  const statics = [...index.matchAll(/^import (\w+)(?:, \{[^}]*\})? from '([^']+(?:Panel|Section|Inspector))'$/gm)].map((m) => m[2])
  assert.deepEqual(statics, [])
})
