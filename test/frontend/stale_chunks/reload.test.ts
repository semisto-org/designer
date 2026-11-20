import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleStaleChunk } from '../../../app/frontend/lib/staleChunks.ts'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => { data.delete(key) },
    setItem: (key, value) => { data.set(key, String(value)) },
  }
}

function setup(overrides: { pending?: number; now?: number } = {}) {
  const storage = memoryStorage()
  let reloads = 0
  let prevented = 0
  const event = { preventDefault: () => { prevented += 1 } }
  const env = {
    storage,
    reload: () => { reloads += 1 },
    pendingWrites: () => overrides.pending ?? 0,
    now: () => overrides.now ?? 1_000_000,
  }
  return { storage, event, env, counts: () => ({ reloads, prevented }) }
}

test('a chunk gone after a deploy reloads the page once, without reporting the error', () => {
  const { event, env, counts } = setup()
  assert.equal(handleStaleChunk(event, env), true)
  assert.deepEqual(counts(), { reloads: 1, prevented: 1 })
})

test('a second failure right after the reload is left to the error tracker (no reload loop)', () => {
  const { event, env, counts } = setup()
  handleStaleChunk(event, env)
  assert.equal(handleStaleChunk(event, env), false)
  assert.deepEqual(counts(), { reloads: 1, prevented: 1 })
})

test('reloads again once the guard window has passed', () => {
  const first = setup({ now: 1_000_000 })
  handleStaleChunk(first.event, first.env)
  const later = { ...first.env, now: () => 1_000_000 + 60_000 }
  assert.equal(handleStaleChunk(first.event, later), true)
  assert.equal(first.counts().reloads, 2)
})

test('never reloads while a change is still being saved', () => {
  const { event, env, counts } = setup({ pending: 1 })
  assert.equal(handleStaleChunk(event, env), false)
  assert.deepEqual(counts(), { reloads: 0, prevented: 0 })
})

test('works when session storage is unavailable', () => {
  const { event, env, counts } = setup()
  const broken = { ...env, storage: { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } } as unknown as Storage }
  assert.equal(handleStaleChunk(event, broken), true)
  assert.equal(counts().reloads, 1)
})
