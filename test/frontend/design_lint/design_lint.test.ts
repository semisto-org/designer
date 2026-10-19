import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compare, formatBaseline, parseBaseline, scanSource } from '../../../script/design_lint.mjs'

test('counts each departure from the carnet primitives', () => {
  const source = [
    `<p className="text-xs text-[11px] text-sm">`,
    `if (!confirm('Supprimer ?')) return`,
    `<div style={{ color: '#5b5781' }}>`,
    `<button type="button">`,
  ].join('\n')
  assert.deepEqual(scanSource('app/frontend/pages/x.tsx', source), {
    'small-text': 2, 'native-confirm': 1, 'hex-color': 1, 'bare-button': 1,
  })
})

test('leaves the primitives, plain scripts, comments and justified lines alone', () => {
  assert.deepEqual(scanSource('app/frontend/components/ui/Button.tsx', '<button type={type} />'), {})
  assert.deepEqual(scanSource('app/frontend/map/layers/water.ts', `paint: { 'fill-color': '#6f97b6' }`), {})
  assert.deepEqual(scanSource('app/frontend/x.tsx', '// never confirm() here, text-xs'), {})
  assert.deepEqual(scanSource('app/frontend/x.tsx', `{/* design-lint-ok: MapLibre needs it */}\nconst c = '#ffffff'`), {})
  assert.deepEqual(scanSource('app/frontend/x.tsx', 'await confirmAction({ title }); href="#plants"; text-sm'), {})
})

test('fails only on what got worse, and offers to lock in what got better', () => {
  const baseline = parseBaseline(formatBaseline(new Map([['small-text\ta.tsx', 3], ['bare-button\tb.tsx', 1]])))
  const current = new Map([['small-text\ta.tsx', 2], ['bare-button\tb.tsx', 2], ['native-confirm\tc.tsx', 1]])
  const { worse, better } = compare(baseline, current)
  assert.deepEqual(worse.map((w: { key: string }) => w.key), ['bare-button\tb.tsx', 'native-confirm\tc.tsx'])
  assert.deepEqual(better.map((b: { key: string }) => b.key), ['small-text\ta.tsx'])
})
