import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infraredTwins, photoSteps, trueColourKey, vintageLabel, yearsAgo } from '../../../app/frontend/map/data/photoArchive.ts'
import type { RegionLayerData } from '../../../app/frontend/types/index.ts'

const layer = (key: string, options: Record<string, unknown>, extra: Partial<RegionLayerData> = {}): RegionLayerData => ({
  id: 1, key, name: key, group: 'photos', category: 'base', kind: 'wms', layers: '0', attribution: null, opacity: 1,
  legendUrl: null, minZoom: null, maxZoom: 19, identifiable: false, proxied: true, url: null, options, position: 20, ...extra,
})

const layers = [
  layer('plan', {}, { group: 'plan', kind: 'style' }),
  layer('ortho_2026', { year: 2026, vintage: 'printemps 2026', default: true }),
  layer('ortho_2026_ir', { year: 2026, infrared_of: 'ortho_2026' }),
  layer('ortho_1971', { year: 1971, vintage: '1971' }),
  layer('ortho_1994', { year: 1994, vintage: '1994-2000' }),
  layer('ortho_2022_ete', { year: 2022, vintage: 'été 2022', partial: true }),
  layer('ortho', { latest: true, vintage: 'la plus récente' }, { position: 50 }),
  layer('sols', {}, { category: 'overlay', group: 'terrain' }),
]

test('the timeline runs from the oldest flight to the latest, without twins or overlays', () => {
  assert.deepEqual(photoSteps(layers).map((l) => l.key), ['ortho_1971', 'ortho_1994', 'ortho_2022_ete', 'ortho_2026', 'ortho'])
})

test('a partial flight that misses the map leaves the timeline, unless it is the photo shown', () => {
  assert.ok(!photoSteps(layers, ['ortho_2022_ete']).some((l) => l.key === 'ortho_2022_ete'))
  assert.ok(photoSteps(layers, ['ortho_2022_ete'], 'ortho_2022_ete').some((l) => l.key === 'ortho_2022_ete'))
})

test('an infrared twin stands for its true colour photo', () => {
  assert.equal(infraredTwins(layers).get('ortho_2026')?.key, 'ortho_2026_ir')
  assert.equal(trueColourKey(layers, 'ortho_2026_ir'), 'ortho_2026')
  assert.equal(trueColourKey(layers, 'ortho_1971'), 'ortho_1971')
  assert.equal(trueColourKey(layers, 'plan'), null)
})

test('how long ago, counted from the last year of the flight', () => {
  const find = (key: string) => layers.find((l) => l.key === key)!
  assert.equal(yearsAgo(find('ortho_1994'), 2026), 26)
  assert.equal(yearsAgo(find('ortho_2026'), 2026), 0)
  assert.equal(yearsAgo(find('ortho'), 2026), null)
  assert.equal(vintageLabel(find('ortho_1994')), '1994-2000')
})
