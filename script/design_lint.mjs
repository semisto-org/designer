#!/usr/bin/env node
// Design guard: keeps the frontend on the shared « carnet » primitives of
// app/frontend/components/ui. It refuses, in app/frontend:
//   small-text      text-xs or an arbitrary size under 14 px (text-sm is the floor)
//   native-confirm  the browser's confirm(): use confirmAction() (components/ui/confirm)
//   hex-color       a hard-coded #hex colour in a component (.tsx): use the theme tokens
//   bare-button     a hand-made <button> outside components/ui: use Button or IconButton
//
// What existed when the guard arrived is frozen in config/design_lint_baseline.tsv
// (rule, count, file). The check fails only when a file has more of a rule
// than its baseline, so every PR can leave things better, never worse.
//
//   node script/design_lint.mjs            check (CI)
//   node script/design_lint.mjs --update   rewrite the baseline after a clean-up
//   node script/design_lint.mjs --report   totals per rule, and the worst files
//
// A justified exception carries `design-lint-ok: <reason>` on the same line
// or the line above (for instance a colour MapLibre needs as a string).

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SOURCE = 'app/frontend'
export const BASELINE = 'config/design_lint_baseline.tsv'
export const RULES = ['small-text', 'native-confirm', 'hex-color', 'bare-button']

const PATTERNS = {
  'small-text': /\btext-xs\b|\btext-\[(?:\d|1[0-3])(?:\.\d+)?px\]|\btext-\[0?\.\d+rem\]/g,
  'native-confirm': /(?<![\w.$])confirm\s*\(|\bwindow\.confirm\s*\(/g,
  'hex-color': /(?<=["'`(\s:,[])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  'bare-button': /<button\b/g,
}

function applies(rule, path) {
  if (rule === 'hex-color') return path.endsWith('.tsx')
  if (rule === 'bare-button') return path.endsWith('.tsx') && !path.startsWith(`${SOURCE}/components/ui/`)
  return true
}

const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line)

/** Counts per rule for one file's source. */
export function scanSource(path, text) {
  const counts = {}
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (isComment(line)) return
    if (line.includes('design-lint-ok') || (i > 0 && lines[i - 1].includes('design-lint-ok'))) return
    for (const rule of RULES) {
      if (!applies(rule, path)) continue
      const found = line.match(PATTERNS[rule])
      if (found) counts[rule] = (counts[rule] ?? 0) + found.length
    }
  })
  return counts
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full)
  }
  return out
}

/** Map of "rule\tpath" → count for the whole frontend. */
export function scanTree(root = ROOT) {
  const result = new Map()
  for (const file of walk(join(root, SOURCE))) {
    const path = relative(root, file).split(sep).join('/')
    for (const [rule, count] of Object.entries(scanSource(path, readFileSync(file, 'utf8')))) {
      result.set(`${rule}\t${path}`, count)
    }
  }
  return result
}

export function parseBaseline(text) {
  const result = new Map()
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [rule, count, path] = line.split('\t')
    result.set(`${rule}\t${path}`, Number(count))
  }
  return result
}

export function formatBaseline(current) {
  const rows = [...current.entries()]
    .map(([key, count]) => { const [rule, path] = key.split('\t'); return { rule, path, count } })
    .sort((a, b) => a.path.localeCompare(b.path) || a.rule.localeCompare(b.rule))
  return [
    '# Design guard baseline (script/design_lint.mjs). Rule, count, file.',
    '# Lower it with `npm run design:lint -- --update` after a clean-up; never raise it by hand.',
    ...rows.map((r) => `${r.rule}\t${r.count}\t${r.path}`),
  ].join('\n') + '\n'
}

/** What got worse (fails the check) and what got better (can be locked in). */
export function compare(baseline, current) {
  const worse = []
  const better = []
  for (const [key, count] of current) {
    const allowed = baseline.get(key) ?? 0
    if (count > allowed) worse.push({ key, count, allowed })
  }
  for (const [key, allowed] of baseline) {
    const count = current.get(key) ?? 0
    if (count < allowed) better.push({ key, count, allowed })
  }
  return { worse, better }
}

export function totals(counts) {
  const sums = Object.fromEntries(RULES.map((rule) => [rule, 0]))
  for (const [key, count] of counts) sums[key.split('\t')[0]] += count
  return sums
}

const ADVICE = {
  'small-text': 'text-sm is the smallest size in Terranova.',
  'native-confirm': 'use confirmAction() from @/components/ui/confirm.',
  'hex-color': 'use a theme token (prune, loam, leaf, humus, lichen, clay…).',
  'bare-button': 'use Button or IconButton from @/components/ui.',
}

function main(args) {
  const current = scanTree()
  const baselinePath = join(ROOT, BASELINE)
  if (args.includes('--update')) {
    writeFileSync(baselinePath, formatBaseline(current))
    console.log(`Baseline written: ${current.size} entries.`, totals(current))
    return 0
  }
  if (args.includes('--report')) {
    console.log(totals(current))
    const worst = [...current.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    for (const [key, count] of worst) console.log(String(count).padStart(4), key.replace('\t', '  '))
    return 0
  }
  const baseline = existsSync(baselinePath) ? parseBaseline(readFileSync(baselinePath, 'utf8')) : new Map()
  const { worse, better } = compare(baseline, current)
  if (better.length) {
    console.log(`${better.length} file(s) got cleaner than the baseline: run \`npm run design:lint -- --update\` to lock it in.`)
  }
  if (worse.length === 0) {
    console.log('Design guard: nothing new.', totals(current))
    return 0
  }
  console.error('Design guard: new departures from the « carnet » primitives.\n')
  for (const { key, count, allowed } of worse) {
    const [rule, path] = key.split('\t')
    console.error(`  ${path}: ${rule} ${count} (allowed ${allowed}) — ${ADVICE[rule]}`)
  }
  console.error('\nSee /admin/design for the primitives. A justified exception carries `design-lint-ok: <reason>`.')
  return 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)))
