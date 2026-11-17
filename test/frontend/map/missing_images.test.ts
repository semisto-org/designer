import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { resolveMissingImages } from '../../../app/frontend/map/layers/missingImages.ts'

// MapLibre keeps one resolver per map: the modules that draw images on demand share it.
function fakeMap() {
  const images = new Set<string>()
  let resolver: ((id: string) => void) | null = null
  const map = {
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => { images.add(id) },
    setMissingStyleImageResolver: (r: (id: string) => void) => { resolver = r },
  }
  return { map: map as unknown as MapLibreMap, images, ask: (id: string) => resolver?.(id) }
}

test('each module draws its own images, the first one able to answers', () => {
  const { map, images, ask } = fakeMap()
  const calls: string[] = []
  resolveMissingImages(map, (id) => { calls.push(`drawing:${id}`); if (id.startsWith('drawing-')) (map.addImage as (id: string) => void)(id) })
  resolveMissingImages(map, (id) => { calls.push(`copy:${id}`); (map.addImage as (id: string) => void)(id) })

  ask('drawing-hatch-#3b7ea1')
  ask('label-bg')
  assert.ok(images.has('drawing-hatch-#3b7ea1'))
  assert.ok(images.has('label-bg'))
  // The copy was not asked for an image the drawing layers already made.
  assert.deepEqual(calls, ['drawing:drawing-hatch-#3b7ea1', 'drawing:label-bg', 'copy:label-bg'])
})

test('a withdrawn resolver is not asked again', () => {
  const { map, ask } = fakeMap()
  const calls: string[] = []
  const withdraw = resolveMissingImages(map, (id) => calls.push(id))
  ask('a')
  withdraw()
  ask('b')
  assert.deepEqual(calls, ['a'])
})
