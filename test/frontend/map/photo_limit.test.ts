import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pastPhotoLimit, photoMaxZoom } from '../../../app/frontend/map/data/photoLimit.ts'
import type { RegionLayerData } from '../../../app/frontend/types/index.ts'

const layer = (key: string, group: string, maxZoom: number | null, category: 'base' | 'overlay' = 'base') =>
  ({ key, group, maxZoom, category }) as RegionLayerData
const layers = [layer('ortho', 'photos', 19), layer('plan_ign', 'plan', 19), layer('ombrage', 'terrain', 18, 'overlay')]

test('only an aerial photo base map has a limit', () => {
  assert.equal(photoMaxZoom(layers, 'ortho'), 19)
  assert.equal(photoMaxZoom(layers, 'plan_ign'), null)
  assert.equal(photoMaxZoom(layers, 'ombrage'), null)
  assert.equal(photoMaxZoom(layers, null), null)
  assert.equal(photoMaxZoom([layer('ortho', 'photos', null)], 'ortho'), null)
})

test('a little past the last level is fine, clearly past it is blurry', () => {
  assert.equal(pastPhotoLimit(19, 19), false)
  assert.equal(pastPhotoLimit(19.3, 19), false)
  assert.equal(pastPhotoLimit(20, 19), true)
  assert.equal(pastPhotoLimit(22, null), false)
})
