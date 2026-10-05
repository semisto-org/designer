import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gpsAccuracy, gpsToCheck } from '../../../app/frontend/map/gps/accuracy.ts'

test('the accuracy is read only when it is a positive number', () => {
  assert.equal(gpsAccuracy({ gps_accuracy_m: 14.2 }), 14.2)
  assert.equal(gpsAccuracy({}), null)
  assert.equal(gpsAccuracy({ gps_accuracy_m: '14' }), null)
  assert.equal(gpsAccuracy({ gps_accuracy_m: 0 }), null)
})

test('an imprecise fix is flagged until it is checked', () => {
  assert.equal(gpsToCheck({ gps_accuracy_m: 14 }), true)
  assert.equal(gpsToCheck({ gps_accuracy_m: 14, gps_checked: true }), false)
  assert.equal(gpsToCheck({ gps_accuracy_m: 10 }), false)
  assert.equal(gpsToCheck({}), false)
})
