import assert from 'node:assert/strict'
import test from 'node:test'
import { readThreadList } from '../../../app/frontend/collab/threadsPayload.ts'

test('a full answer gives its threads and the e-mail setting', () => {
  const threads = [{ id: 1, unread: true }]
  assert.deepEqual(readThreadList({ threads, commentEmails: false }), { threads, commentEmails: false })
})

test('an answer without a thread list (an empty or non-JSON body) is ignored', () => {
  assert.equal(readThreadList({}), null)
  assert.equal(readThreadList(undefined), null)
  assert.equal(readThreadList({ threads: null, commentEmails: true }), null)
})

test('a missing e-mail setting keeps e-mails on', () => {
  assert.deepEqual(readThreadList({ threads: [] }), { threads: [], commentEmails: true })
})
