import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dragTolerances, MOUSE_TOLERANCES, TOUCH_TOLERANCES } from '../../../app/frontend/map/editor/pointerTolerance.ts'

test('a mouse keeps Terra Draw defaults', () => {
  assert.deepEqual(dragTolerances('mouse'), MOUSE_TOLERANCES)
  assert.deepEqual(dragTolerances(''), MOUSE_TOLERANCES)
})

test('an Apple Pencil or a finger may wander a few pixels and still tap', () => {
  for (const type of ['pen', 'touch']) {
    const tolerances = dragTolerances(type)
    assert.equal(tolerances, TOUCH_TOLERANCES)
    assert.ok(tolerances.minPixelDragDistance >= 6)
    assert.ok(tolerances.minPixelDragDistanceSelecting >= 6)
    assert.ok(tolerances.minPixelDragDistanceDrawing >= MOUSE_TOLERANCES.minPixelDragDistanceDrawing)
  }
})

// draw.ts sets these private fields of Terra Draw's adapter per press: an
// upgrade that renames them would silently bring the pencil bug back.
test('Terra Draw still keeps its drag tolerances in the fields draw.ts sets', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../../../node_modules/terra-draw/dist/terra-draw.module.js', import.meta.url), 'utf8')
  for (const field of ['_minPixelDragDistance', '_minPixelDragDistanceSelecting', '_minPixelDragDistanceDrawing']) {
    assert.ok(source.includes(`this.${field}=`), field)
  }
})
