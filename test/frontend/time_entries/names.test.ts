import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readableName } from '../../../app/frontend/time_entries/names.ts'

test('an e-mail handle reads as a name', () => {
  assert.equal(readableName('j.chevolet'), 'J. Chevolet')
  assert.equal(readableName('a.vilain'), 'A. Vilain')
  assert.equal(readableName('marie-claire_dupont'), 'Marie Claire Dupont')
})

test('a real name is left as it is', () => {
  assert.equal(readableName('Christophe Wautier'), 'Christophe Wautier')
  assert.equal(readableName('eric'), 'eric')
  assert.equal(readableName('j.chevolet2'), 'j.chevolet2')
})
