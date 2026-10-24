require "test_helper"
require "test_helpers/drone_pilots_test_helper"
require "test_helpers/billing_test_helper"

class DronePilotProfilesControllerTest < ActionDispatch::IntegrationTest
  include DronePilotsTestHelper
  include BillingTestHelper
  include ActionMailer::TestHelper

  def application(**overrides)
    { display_name: "Bob vole", base_place: "Namur", lng: 4.867, lat: 50.467, service_radius_km: 50, mission_price: "290,50",
      travel_fees_enabled: "1", drones: [ { model: "mavic_3_enterprise" } ], data_types: %w[photos orthophoto elevation],
      certificates: %w[a1_a3], operator_number: "bel 12a3b4c5d6e", insurer: "AXA 42", legal_form: "company",
      legal_name: "Bob SRL", business_number: "BE0123456789", address: "Rue 1, Namur", country: "BE" }.merge(overrides)
  end

  test "a user applies to be listed, and Semisto is told" do
    sign_in_as users(:bob)
    assert_enqueued_emails 1 do
      post drone_pilot_profile_path, params: { drone_pilot: application }
    end
    assert_redirected_to drone_pilot_profile_path
    pilot = users(:bob).reload.drone_pilot
    assert pilot.pending?
    assert_equal 290_50, pilot.mission_price_cents
    assert_equal "BEL12A3B4C5D6E", pilot.operator_number
    assert_in_delta 50.467, pilot.latitude, 0.001
    refute pilot.listed?
  end

  test "data the drones cannot produce is refused with a readable message" do
    sign_in_as users(:bob)
    post drone_pilot_profile_path, params: { drone_pilot: application(data_types: %w[thermal]) }
    follow_redirect!(headers: inertia_headers)
    assert_match "Tes drones ne permettent pas de livrer", response.parsed_body.dig("props", "errors", "data_types")
    assert_nil users(:bob).reload.drone_pilot
  end

  test "a rejected pilot corrects and sends the application again" do
    pilot = create_pilot(users(:bob), status: "rejected", review_note: "Assurance ?")
    sign_in_as users(:bob)
    patch drone_pilot_profile_path, params: { drone_pilot: { insurer: "Ethias 99", resubmit: "1" } }
    assert pilot.reload.pending?
    assert_equal "Ethias 99", pilot.insurer
  end

  test "an approved pilot opens their Stripe account, and comes back ready" do
    pilot = create_pilot(users(:bob), stripe_account_id: nil, payouts_enabled: false)
    accounts = []
    with_billing do
      stub_stripe_post("accounts", { id: "acct_new" }, log: accounts)
      stub_stripe_post("account_links", { url: "https://connect.stripe.com/setup/e/acct_new" })
      sign_in_as users(:bob)
      post stripe_drone_pilot_profile_path
      assert_redirected_to "https://connect.stripe.com/setup/e/acct_new"
      assert_equal "express", accounts.sole["type"]
      assert_equal "acct_new", pilot.reload.stripe_account_id

      stub_stripe_get("accounts/acct_new", { id: "acct_new", payouts_enabled: true, details_submitted: true,
                                             capabilities: { transfers: "active", card_payments: "active" } })
      get stripe_return_drone_pilot_profile_path
      assert pilot.reload.listed?
    end
  end
end
