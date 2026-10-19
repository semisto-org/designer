require "test_helper"
require "test_helpers/drone_pilots_test_helper"
require "test_helpers/billing_test_helper"

class Admin::DronePilotsControllerTest < ActionDispatch::IntegrationTest
  include DronePilotsTestHelper
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup do
    users(:michael).update!(admin: true)
    @pilot = create_pilot(users(:bob), status: "pending")
  end

  test "staff see applications with their legal details; others cannot" do
    sign_in_as users(:alice)
    get admin_drone_pilots_path
    assert_response :not_found

    sign_in_as users(:michael)
    get admin_drone_pilots_path, headers: inertia_headers
    assert_equal "83.02.01-123.45", response.parsed_body.dig("props", "pilots").sole["taxNumber"]
  end

  test "approving tells the pilot; refusing needs a note" do
    sign_in_as users(:michael)
    patch admin_drone_pilot_path(@pilot), params: { drone_pilot: { decision: "reject", note: "" } }
    assert @pilot.reload.pending?
    assert_enqueued_emails 1 do
      patch admin_drone_pilot_path(@pilot), params: { drone_pilot: { decision: "approve" } }
    end
    assert @pilot.reload.approved?
    assert_equal users(:michael), @pilot.reviewed_by
  end

  test "Semisto refunds a paid mission before the pilot is paid" do
    @pilot.update!(status: "approved")
    mission = paid_mission(pilot: @pilot, client: users(:michael), map: maps(:ahinvaux))
    refunds = []
    with_billing do
      stub_stripe_post("refunds", { id: "re_1" }, log: refunds)
      sign_in_as users(:michael)
      post mission_admin_drone_pilots_path(mission.id), params: { decision: "refund" }
    end
    assert mission.reload.refunded?
    assert_equal "pi_drone", refunds.sole["payment_intent"]
  end
end
