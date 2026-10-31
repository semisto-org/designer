import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pendingWrites, resetSaveStatus, saveSnapshot as snapshotForTest, trackWrite } from '../../../app/frontend/lib/saveStatus.ts'

test('a write in flight reads as saving, then saved with its time', () => {
  resetSaveStatus()
  const end = trackWrite()
  assert.equal(snapshotForTest().state, 'saving')
  assert.equal(pendingWrites(), 1)
  end('ok')
  assert.equal(snapshotForTest().state, 'saved')
  assert.ok(snapshotForTest().savedAt)
  assert.equal(pendingWrites(), 0)
})

test('stays saving until the last of several writes lands', () => {
  resetSaveStatus()
  const a = trackWrite()
  const b = trackWrite()
  a('ok')
  assert.equal(snapshotForTest().state, 'saving')
  b('ok')
  assert.equal(snapshotForTest().state, 'saved')
})

test('a lost write says so until a later one lands', () => {
  resetSaveStatus()
  trackWrite()('lost')
  assert.equal(snapshotForTest().state, 'failed')
  const refused = trackWrite()
  refused('rejected')
  assert.equal(snapshotForTest().state, 'failed')
  trackWrite()('ok')
  assert.equal(snapshotForTest().state, 'saved')
})

test('a refused write (validation) is not a lost one', () => {
  resetSaveStatus()
  trackWrite()('rejected')
  assert.equal(snapshotForTest().state, 'saved')
})

test('ending twice counts once', () => {
  resetSaveStatus()
  const end = trackWrite()
  end('ok')
  end('ok')
  assert.equal(pendingWrites(), 0)
})
