import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from '@tiptap/pm/model'
import * as Y from 'yjs'
import { fromBase64, seedFromDoc, toBase64 } from '../../../app/frontend/documents/markdown/collabSeed.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: { group: 'block', content: 'text*', attrs: { level: { default: 1 } } },
    text: {},
  },
})
const page = () => schema.node('doc', null, [
  schema.node('heading', { level: 1 }, [schema.text('Journal du jardin')]),
  schema.node('paragraph', null, [schema.text('Les noisetiers fleurissent.')]),
])

test('two browsers build the same first edit, which counts once', () => {
  const a = seedFromDoc(page())
  const b = seedFromDoc(page())
  assert.deepEqual(a, b)

  const shared = new Y.Doc()
  Y.applyUpdate(shared, a)
  Y.applyUpdate(shared, b)
  const text = shared.getXmlFragment('default').toString()
  assert.equal(text.match(/Journal du jardin/g)?.length, 1)
  assert.equal(text.match(/noisetiers/g)?.length, 1)
})

test('edits travel as base64, large ones included', () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 251)
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes)
  assert.equal(toBase64(new Uint8Array([1, 2, 255])), Buffer.from([1, 2, 255]).toString('base64'))
})
