import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SPECIES } from '../../../app/frontend/components/site/timelapse/model.ts'
import { BIRDS } from '../../../app/frontend/components/site/timelapse/model.ts'
import { LITTER, LOOKS, SMALL_SPRITES, SPRITES, spriteRect } from '../../../app/frontend/components/site/timelapse/paint.ts'

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
    const keys = [look.leaf, look.autumn, look.bare, look.blossom, look.fruit, ...(look.variants ?? [])].filter(Boolean)
    for (const key of keys) assert.ok([...SPRITES, ...SMALL_SPRITES].includes(key as never), `${sp}: ${key}`)
  }
})

test('fruit sprites belong to the species that bear fruit, blossom to the fruit trees and the hedge', () => {
  for (const [sp, look] of Object.entries(LOOKS)) {
    const s = SPECIES[sp as keyof typeof SPECIES]
    if (look.fruit) assert.ok(s.fruit < 99, sp)
    if (look.blossom) assert.ok(s.kind === 'fruit' || s.kind === 'hedge', sp)
  }
})

test('ground covers die back to their litter, and every bird and fish has its painting', () => {
  for (const [sp, look] of Object.entries(LOOKS)) {
    if (SPECIES[sp as keyof typeof SPECIES].kind === 'herb') assert.ok(LITTER.includes(look.bare), sp)
  }
  for (const key of [...BIRDS, 'gardon', 'poisson_rouge']) assert.ok(SMALL_SPRITES.includes(key as never), key)
})

test('every sprite sits inside the atlases built by script/timelapse_sprites.py', () => {
  const big = webpSize('atlas.webp')
  const small = webpSize('small.webp')
  assert.equal(new Set([...SPRITES, ...SMALL_SPRITES]).size, SPRITES.length + SMALL_SPRITES.length)
  for (const key of [...SPRITES, ...SMALL_SPRITES]) {
    const cell = spriteRect(key)
    const [w, h] = cell.small ? small : big
    assert.equal(w % cell.side, 0)
    assert.ok(cell.x + cell.side <= w && cell.y + cell.side <= h, key)
  }
})
