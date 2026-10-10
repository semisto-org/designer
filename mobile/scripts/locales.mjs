// Builds the app's copies of two server files, which stay the single
// sources of truth:
// - src/i18n/fr.json from the Rails locale files (config/locales/*.fr.yml),
//   only the keys the app uses: mobile.fr.yml and shared vocabularies;
// - src/i18n/elements.json from the element library (config/map_elements.yml):
//   per layer its colour and, per kind, geometries and colour.
// Run: npm run locales (CI runs it with --check).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const localesDir = join(root, 'config', 'locales')
const SHARED = [
  ['mobile'],
  ['plants', 'strata'],
  ['plant_feature'],
  ['plant_observations'],
  ['editor', 'layers'],
  ['editor', 'kinds'],
  ['plantnet'],
  ['soil', 'abundances'],
  ['soil', 'indicators'],
]

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      deepMerge(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

const all = {}
for (const file of readdirSync(localesDir).filter((f) => f.endsWith('.yml')).sort()) {
  const tree = parse(readFileSync(join(localesDir, file), 'utf8'))?.fr
  if (tree) deepMerge(all, tree)
}

const out = {}
for (const path of SHARED) {
  let value = all
  for (const key of path) value = value?.[key]
  if (value === undefined) throw new Error(`Missing locale key fr.${path.join('.')}`)
  let target = out
  path.slice(0, -1).forEach((key) => { target = target[key] ??= {} })
  target[path.at(-1)] = value
}

const catalog = parse(readFileSync(join(root, 'config', 'map_elements.yml'), 'utf8'))
const elements = Object.fromEntries(Object.entries(catalog.layers).map(([layer, config]) => [layer, {
  color: config.color,
  elements: Object.fromEntries(Object.entries(config.elements).map(([kind, spec]) => [kind, {
    geometries: [spec.geometry].flat(),
    color: spec.color ?? config.color,
    pickable: spec.pickable ?? true,
  }])),
}]))

let stale = false
for (const [name, value] of [['fr.json', out], ['elements.json', elements]]) {
  const file = join(root, 'mobile', 'src', 'i18n', name)
  const json = `${JSON.stringify(value, null, 2)}\n`
  if (!process.argv.includes('--check')) writeFileSync(file, json)
  else if (readFileSync(file, 'utf8') !== json) stale = true
}
if (stale) {
  console.error('src/i18n is out of date: run npm run locales')
  process.exit(1)
}
