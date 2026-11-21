import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleStaleChunk, reloadingForFreshBuild } from '../../../app/frontend/lib/staleChunks.ts'

// Once Vite's preload error is cancelled for a reload, the page that asked
// for the chunk gets `undefined` and Inertia throws « Page not found » just
// before the page goes away (SEMISTO-DESIGNER-1B). That error is ours, not
// the person's: the error tracker drops what happens while reloading.
test('the error tracker is told while a reload for a fresh build is under way', () => {
  assert.equal(reloadingForFreshBuild(), false)
  const env = {
    storage: { getItem: () => null, setItem: () => {} },
    reload: () => {},
    pendingWrites: () => 0,
    now: () => 1_000_000,
  }
  assert.equal(handleStaleChunk({ preventDefault: () => {} }, env), true)
  assert.equal(reloadingForFreshBuild(), true)
})
