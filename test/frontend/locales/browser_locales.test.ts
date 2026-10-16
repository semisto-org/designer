import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { SERVER_ONLY_KEYS, browserLocales } from '../../../app/frontend/lib/browserLocales.ts'

const root = join(import.meta.dirname, '../../..')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) && entry.name !== 'browserLocales.ts' ? [readFileSync(path, 'utf8')] : []
  })
}

test('drops server-only subtrees and keeps only MCP tool titles', () => {
  const pruned = browserLocales({
    fr: {
      maps: { title: 'Mes cartes' },
      magic_link_mailer: { subject: 'Ton lien' },
      mobile: { common: { ok: 'OK' } },
      mcp: { server: { instructions: 'Long text' }, tools: { list_maps: { title: 'Lister les cartes', description: 'Long text' } } },
    },
  })
  assert.deepEqual(pruned, {
    fr: { maps: { title: 'Mes cartes' }, mcp: { tools: { list_maps: { title: 'Lister les cartes' } } } },
  })
})

test('every server-only key exists and no component reads one', () => {
  const locales = readdirSync(join(root, 'config/locales')).filter((name) => name.endsWith('.yml'))
  const keys = new Set(locales.flatMap((name) => Object.keys(parse(readFileSync(join(root, 'config/locales', name), 'utf8'))?.fr ?? {})))
  const code = sources(join(root, 'app/frontend')).join('\n')
  for (const key of SERVER_ONLY_KEYS) {
    assert.ok(keys.has(key), `${key} is not a locale key any more`)
    assert.doesNotMatch(code, new RegExp(`['"\`]${key}\\.`), `the frontend reads ${key}`)
  }
  for (const [, path] of code.matchAll(/['"`]mcp\.([^'"`]+)['"`]/g)) {
    assert.match(path, /^tools\.(\w+|\$\{[^}]+\})\.title$/, `the frontend reads mcp.${path}`)
  }
})
