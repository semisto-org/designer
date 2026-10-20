require "test_helper"
require "test_helpers/drone_pilots_test_helper"
require "test_helpers/billing_test_helper"

class DroneMissions::PayoutTest < ActiveSupport::TestCase
  include DronePilotsTestHelper
  include BillingTestHelper

  setup do
    @mission = paid_mission(pilot: create_pilot(users(:bob)), client: users(:michael), map: maps(:ahinvaux))
    @mission.deliver!
  end

  test "a week after delivery, the pilot is paid without the client doing anything" do
    with_billing do
      stub_stripe_get("payment_intents/pi_drone", { id: "pi_drone", latest_charge: "ch_drone" })
      transfer = stub_stripe_post("transfers", { id: "tr_1" })
      DroneMission.release_due_payouts!(1.day.from_now)
      assert_not_requested transfer
      DroneMission.release_due_payouts!(8.days.from_now)
      assert @mission.reload.completed?
      assert_requested transfer, times: 1
    end
  end

  test "a refused transfer is kept for Semisto, and the mission stays delivered" do
    with_billing do
      stub_stripe_get("payment_intents/pi_drone", { id: "pi_drone", latest_charge: "ch_drone" })
      stub_stripe_post("transfers", { error: { message: "Insufficient funds", type: "invalid_request_error" } }, status: 400)
      assert_equal "payout failed", DroneMissions::Payout.call(@mission)
    end
    assert @mission.reload.delivered?
    assert_match "Insufficient funds", @mission.payout_error
  end

  test "Stripe's account.updated lists the pilot once they can be paid" do
    pilot = @mission.drone_pilot
    pilot.update!(payouts_enabled: false)
    with_billing do
      event = stripe_event("account.updated", { "id" => pilot.stripe_account_id, "object" => "account", "payouts_enabled" => true,
                                                "details_submitted" => true, "capabilities" => { "transfers" => "active", "card_payments" => "active" } })
      assert_equal "pilot account synced", Billing::Webhook.process(event)
    end
    assert pilot.reload.payouts_enabled?
  end
end
