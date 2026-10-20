import { test } from 'node:test'
import assert from 'node:assert/strict'
import { returnToOffer } from '../../../app/frontend/components/offers/returnTo.ts'

test('the templates page leads back to the offer it was opened from, and nowhere else', () => {
  assert.equal(returnToOffer('/offer_templates?return_to=%2Fmaps%2F12%2Foffer'), '/maps/12/offer')
  assert.equal(returnToOffer('/offer_templates/3/edit?return_to=/maps/12/offer'), '/maps/12/offer')
  assert.equal(returnToOffer('/offer_templates'), null)
  assert.equal(returnToOffer('/offer_templates?return_to=https%3A%2F%2Fevil.example'), null)
  assert.equal(returnToOffer('/offer_templates?return_to=//evil.example/maps/1/offer'), null)
  assert.equal(returnToOffer('/offer_templates?return_to=/maps/12/settings'), null)
})
