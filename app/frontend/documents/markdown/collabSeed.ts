import type { Node } from '@tiptap/pm/model'
import { prosemirrorToYXmlFragment } from '@tiptap/y-tiptap'
import * as Y from 'yjs'

/**
 * A page as the first edit of its shared text. Built in a document of its
 * own whose author id is 0, it is the same, byte for byte, in every
 * browser: two people opening a page at once each send it, and it counts once.
 */
export function seedFromDoc(node: Node): Uint8Array {
  const seed = new Y.Doc()
  seed.clientID = 0
  prosemirrorToYXmlFragment(node, seed.getXmlFragment('default'))
  const update = Y.encodeStateAsUpdate(seed)
  seed.destroy()
  return update
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
