import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileDay, formatBytes } from '../../../app/frontend/drone/files.ts'

test('sizes read in Mo below a gigabyte, in Go above', () => {
  assert.equal(formatBytes(640 * 1024 ** 2), '640 Mo')
  assert.equal(formatBytes(1024), '1 Mo')
  assert.equal(formatBytes(1.8 * 1024 ** 3).replace(/\s/g, ' '), '1,8 Go')
})

test('the flight day comes from the file, as a calendar day', () => {
  const file = { lastModified: new Date(2027, 4, 12, 23, 30).getTime() } as File
  assert.equal(fileDay(file), '2027-05-12')
  assert.equal(fileDay({ lastModified: 0 } as File, new Date(2027, 0, 3, 10)), '2027-01-03')
})
