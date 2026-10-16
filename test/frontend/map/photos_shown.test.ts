import { test } from 'node:test'
import assert from 'node:assert/strict'
import { photoMarkersVisible, readPhotosShown } from '../../../app/frontend/map/photos/shown.ts'

const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null })

test('photos show by default', () => {
  assert.equal(readPhotosShown(storage({}), 1), true)
  assert.equal(readPhotosShown(null, 1), true)
})

test('the choice is remembered per map', () => {
  const saved = storage({ 'designer:map:1:photos-shown': 'false', 'designer:map:2:photos-shown': 'true' })
  assert.equal(readPhotosShown(saved, 1), false)
  assert.equal(readPhotosShown(saved, 2), true)
  assert.equal(readPhotosShown(saved, 3), true)
})

test('a map with no choice of its own keeps the old choice made for every map', () => {
  const saved = storage({ 'designer.photos.showOnMap': 'false', 'designer:map:2:photos-shown': 'true' })
  assert.equal(readPhotosShown(saved, 1), false)
  assert.equal(readPhotosShown(saved, 2), true)
})

test('blocked storage shows the photos', () => {
  const blocked = { getItem: () => { throw new Error('SecurityError') } }
  assert.equal(readPhotosShown(blocked, 1), true)
})

test('hidden markers come back while a photo is being placed', () => {
  assert.equal(photoMarkersVisible({ showOnMap: false, placingId: null }), false)
  assert.equal(photoMarkersVisible({ showOnMap: false, placingId: 7 }), true)
  assert.equal(photoMarkersVisible({ showOnMap: true, placingId: null }), true)
})
