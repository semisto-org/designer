require "test_helper"
require "test_helpers/drone_pilots_test_helper"
require "test_helpers/billing_test_helper"

class DroneMissions::RefundTest < ActiveSupport::TestCase
  include DronePilotsTestHelper
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup do
    @mission = paid_mission(pilot: create_pilot(users(:bob)), client: users(:michael), map: maps(:ahinvaux))
  end

  test "sixty days after payment with nothing delivered, the client is refunded and the pilot told why" do
    with_billing do
      refund = stub_stripe_post("refunds", { id: "re_1" })
      DroneMission.refund_undelivered!(59.days.from_now)
      assert_not_requested refund
      assert @mission.reload.paid?
      assert_equal (@mission.paid_at + 60.days).to_date, @mission.deliver_by.to_date

      assert_enqueued_emails 2 do
        DroneMission.refund_undelivered!(61.days.from_now)
      end
      assert @mission.reload.refunded?
      assert_requested refund, times: 1
    end
  end

  test "a delivered mission is never refunded on its own" do
    @mission.deliver!
    assert_empty DroneMission.refund_due(1.year.from_now)
  end
end
