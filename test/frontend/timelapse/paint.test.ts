import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SPECIES } from '../../../app/frontend/components/site/timelapse/model.ts'
import { LOOKS, SPRITE, SPRITES, spriteRect } from '../../../app/frontend/components/site/timelapse/paint.ts'

/** Width and height of a lossy or lossless WebP, read from its header. */
function webpSize(path: string): [number, number] {
  const b = readFileSync(new URL(`../../../app/frontend/components/site/timelapse/paint/${path}`, import.meta.url))
  const chunk = b.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
}

test('every species of the model is dressed with sprites that exist', () => {
  assert.deepEqual(Object.keys(LOOKS).sort(), Object.keys(SPECIES).sort())
  for (const [sp, look] of Object.entries(LOOKS)) {
    for (const key of Object.values(look)) assert.ok(SPRITES.includes(key), `${sp}: ${key}`)
  }
})

test('fruit sprites belong to the species that bear fruit, blossom to the fruit trees', () => {
  for (const [sp, look] of Object.entries(LOOKS)) {
    const s = SPECIES[sp as keyof typeof SPECIES]
    if (look.fruit) assert.ok(s.fruit < 99, sp)
    if (look.blossom) assert.equal(s.kind, 'fruit', sp)
  }
})

test('every sprite sits inside the atlas built by script/timelapse_sprites.py', () => {
  const [w, h] = webpSize('atlas.webp')
  assert.equal(w % SPRITE, 0)
  assert.equal(new Set(SPRITES).size, SPRITES.length)
  for (const key of SPRITES) {
    const [x, y] = spriteRect(key)
    assert.ok(x + SPRITE <= w && y + SPRITE <= h, key)
  }
})
