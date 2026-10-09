import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldedItems, hasLegend, hasOwnLegend } from '../../../app/frontend/components/legend/legend.ts'
import type { LayerLegendItem } from '../../../app/frontend/types/index.ts'

const item = (label: string): LayerLegendItem => ({ label, color: '#000000' })

test('a layer has a legend of its own, an image from its service, or nothing', () => {
  assert.equal(hasOwnLegend({ name: 'pH', legend: { gradient: { colors: ['#fff', '#000'], labels: ['4', '9'] } } }), true)
  assert.equal(hasOwnLegend({ name: 'Sols', legend: null, legendUrl: 'https://example.org/legend.png' }), false)
  assert.equal(hasLegend({ name: 'Sols', legend: null, legendUrl: 'https://example.org/legend.png' }), true)
  assert.equal(hasLegend({ name: 'Vide', legend: { items: [] }, legendUrl: null }), false)
})

test('a short legend shows every class', () => {
  const items = [item('a'), item('b'), item('c')]
  assert.equal(foldedItems(items), items)
})

test('a long legend folds to its first six classes, headings included', () => {
  const items: LayerLegendItem[] = [{ heading: 'Urbain' }, ...'abcd'.split('').map(item), { heading: 'Agricole' }, ...'efghij'.split('').map(item), { heading: 'Eau' }, item('k')]
  const shown = foldedItems(items)
  assert.deepEqual(shown.map((i) => ('heading' in i ? `# ${i.heading}` : i.label)), ['# Urbain', 'a', 'b', 'c', 'd', '# Agricole', 'e', 'f'])
})
