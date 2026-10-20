import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupWarnings } from '../../../app/frontend/components/offers/warnings.ts'

test('trips without a distance make one warning that names their phases', () => {
  const shown = groupWarnings([
    { code: 'trip_without_km', phase: 'pre_design' },
    { code: 'trip_without_km', phase: 'design' },
    { code: 'price_below_computed', phase: 'design' },
    { code: 'trip_without_km', phase: 'implementation' },
  ])
  assert.deepEqual(shown, [
    { code: 'trips_without_km', phases: ['pre_design', 'design', 'implementation'] },
    { code: 'price_below_computed', phase: 'design' },
  ])
})

test('an empty scope hides the design share and the budget alerts, which would only frighten', () => {
  assert.deepEqual(groupWarnings([{ code: 'no_scope' }, { code: 'design_share', share: 79, target: 30 }, { code: 'over_budget', ceiling: 500 }]), [{ code: 'no_scope' }])
  assert.deepEqual(groupWarnings([{ code: 'design_share', share: 79, target: 30 }]), [{ code: 'design_share', share: 79, target: 30 }])
  assert.deepEqual(groupWarnings([]), [])
})
