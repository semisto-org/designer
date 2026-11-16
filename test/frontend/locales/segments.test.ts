import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse } from 'yaml'
import { browserLocales } from '../../../app/frontend/lib/browserLocales.ts'
import { deepMerge, segmentOf, segmentsUsed, splitSegments } from '../../../app/frontend/lib/localeSegments.ts'

// Each module of app/frontend brings the locale segments its key strings
// name (vite.config.ts, `rails-locales`). These tests hold the two ends:
// the cut itself, and the code naming keys that exist.

const root = join(import.meta.dirname, '../../..')
type Tree = Record<string, unknown>

const merged: Tree = {}
for (const name of readdirSync(join(root, 'config/locales')).filter((file) => file.endsWith('.yml'))) {
  const tree = browserLocales(parse(readFileSync(join(root, 'config/locales', name), 'utf8')))
  for (const [locale, keys] of Object.entries(tree)) merged[locale] = deepMerge((merged[locale] ?? {}) as Tree, keys as Tree)
}
const fr = merged.fr as Tree
const segments = splitSegments(merged as Record<string, Tree>)

function sources(dir: string): { path: string; code: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) ? [{ path: relative(root, path), code: readFileSync(path, 'utf8') }] : []
  })
}

const lookup = (key: string) => key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Tree)[part] : undefined), fr)

test('the segments put back together give the whole tree', () => {
  const rebuilt: Tree = {}
  for (const data of segments.values()) deepMerge(rebuilt, structuredClone(data))
  assert.deepEqual(rebuilt, merged)
})

test('a key string names its segment, a prefix every segment under it', () => {
  const ids = ['editor.panels', 'editor.kinds', 'editor', 'billing.plans', 'billing.interval', 'site.home', 'site.faq']
  const used = (code: string) => [...segmentsUsed(code, ids)].sort()
  assert.deepEqual(used("t('editor.panels.water.title')"), ['editor.panels'])
  assert.deepEqual(used("t('editor.save')"), ['editor'])
  assert.deepEqual(used('t(`editor.kinds.${kind}`)'), ['editor.kinds'])
  assert.deepEqual(used('t(`editor.${group}.title`)'), ['editor', 'editor.kinds', 'editor.panels'])
  assert.deepEqual(used('const base = `billing.plans.${key}`'), ['billing.plans'])
  assert.deepEqual(used("content<Faq[]>('site')"), ['site.faq', 'site.home'])
  assert.deepEqual(used("t('nowhere.at.all'); import x from './y.ts'"), [])
})

test('segmentOf follows the cut', () => {
  assert.equal(segmentOf('editor.panels.water.title', fr), 'editor.panels')
  assert.equal(segmentOf('common.save', fr), 'common')
})

// t('a.b.c') with a whole key: the key must exist, or the page shows its last word.
const WHOLE_KEY = /(?<![\w.])(?:t|tf|translations|content|values)\s*(?:<[^>()]*>)?\(\s*(['"])([a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)+)\1/g

test('every key the code reads whole exists', () => {
  const missing: string[] = []
  for (const { path, code } of sources(join(root, 'app/frontend'))) {
    const live = code.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')
    for (const [, , key] of live.matchAll(WHOLE_KEY)) {
      if (lookup(key) === undefined && lookup(`${key}.other`) === undefined) missing.push(`${path}: ${key}`)
    }
  }
  assert.deepEqual(missing, [], `keys with no string:\n${missing.join('\n')}`)
})
