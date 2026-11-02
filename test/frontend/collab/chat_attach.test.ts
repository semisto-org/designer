import assert from 'node:assert/strict'
import test from 'node:test'
import { firstImage, isImage } from '../../../app/frontend/collab/chat/attach.ts'

const file = (name: string, type: string) => ({ name, type })

test('a picture is recognised by its type, or by its name when the type is missing', () => {
  assert.equal(isImage(file('mare.jpg', 'image/jpeg')), true)
  assert.equal(isImage(file('capture.png', 'image/png')), true)
  assert.equal(isImage(file('IMG_0012.HEIC', '')), true)
  assert.equal(isImage(file('plan.pdf', 'application/pdf')), false)
  assert.equal(isImage(file('visite.mov', 'video/quicktime')), false)
  assert.equal(isImage(file('notes', '')), false)
})

test('the first picture among dropped files is joined, the rest left out', () => {
  const dropped = [file('plan.pdf', 'application/pdf'), file('haie.webp', 'image/webp'), file('mare.jpg', 'image/jpeg')]
  assert.equal(firstImage(dropped)?.name, 'haie.webp')
  assert.equal(firstImage([file('plan.pdf', 'application/pdf')]), null)
  assert.equal(firstImage(null), null)
  assert.equal(firstImage([]), null)
})
