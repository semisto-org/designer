import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elides, townOf } from '../../../app/frontend/lib/placeName.ts'

test('the town is the last part of the address, without its postcode', () => {
  assert.equal(townOf('Rue du Bois 3, 5530 Purnode'), 'Purnode')
  assert.equal(townOf('Rue des Écoles, L-1234 Luxembourg'), 'Luxembourg')
  assert.equal(townOf('Yvoir'), 'Yvoir')
  assert.equal(townOf(''), '')
})

test('French elides « de » before a vowel', () => {
  assert.equal(elides('Yvoir'), true)
  assert.equal(elides('Église'), true)
  assert.equal(elides('Purnode'), false)
})
