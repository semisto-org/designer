require "test_helper"
require "test_helpers/drone_pilots_test_helper"
require "test_helpers/billing_test_helper"

class DroneMissionsControllerTest < ActionDispatch::IntegrationTest
  include DronePilotsTestHelper
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @client = users(:michael)
    @pilot_user = users(:bob)
    @pilot = create_pilot(@pilot_user)
    @mission = request_mission(pilot: @pilot, client: @client, map: @map)
  end

  def decide(decision, **extra)
    patch drone_mission_path(@mission), params: { drone_mission: { decision:, **extra } }
  end

  test "only the client and the pilot open a mission; contacts wait for the payment" do
    sign_in_as users(:alice)
    get drone_mission_path(@mission)
    assert_response :not_found

    sign_in_as @client
    get drone_mission_path(@mission), headers: inertia_headers
    mission = response.parsed_body.dig("props", "mission")
    assert_equal "client", mission["role"]
    assert_nil mission.dig("pilot", "phone")
    assert_nil mission.dig("pilot", "email")
  end

  test "the pilot accepts with a date, the client cannot answer for them" do
    sign_in_as @client
    decide("accept")
    assert @mission.reload.requested?

    sign_in_as @pilot_user
    assert_enqueued_emails 1 do
      decide("accept", flight_on: "2027-02-15", text: "Avec plaisir")
    end
    assert @mission.reload.accepted?
    assert_equal Date.new(2027, 2, 15), @mission.flight_on
  end

  test "the client pays on Stripe in the pilot's name, the money waiting for the payout" do
    @mission.accept!(flight_on: nil)
    sessions = []
    with_billing do
      stub_stripe_post("customers", { id: "cus_client" })
      stub_stripe_post("checkout/sessions", { id: "cs_drone", url: "https://checkout.stripe.com/c/pay/cs_drone" }, log: sessions)
      sign_in_as @client
      post checkout_drone_mission_path(@mission)
      assert_redirected_to "https://checkout.stripe.com/c/pay/cs_drone"
    end
    params = sessions.sole
    assert_equal "payment", params["mode"]
    assert_equal "35000", params.dig("line_items", "0", "price_data", "unit_amount")
    assert_equal @mission.travel_cents.to_s, params.dig("line_items", "1", "price_data", "unit_amount")
    assert_equal "acct_bob", params.dig("payment_intent_data", "on_behalf_of")
    assert_equal "drone_mission_#{@mission.id}", params.dig("payment_intent_data", "transfer_group")
    assert_equal @mission.id.to_s, params.dig("metadata", "drone_mission_id")
  end

  test "the webhook records the payment once" do
    @mission.accept!(flight_on: nil)
    session = { "id" => "cs_drone", "object" => "checkout.session", "mode" => "payment", "payment_status" => "paid", "status" => "complete",
                "payment_intent" => "pi_drone", "livemode" => false, "metadata" => { "drone_mission_id" => @mission.id.to_s, "user_id" => @client.id.to_s } }
    with_billing do
      post_stripe_event(stripe_event("checkout.session.completed", session))
      assert_response :success
      post_stripe_event(stripe_event("checkout.session.completed", session))
    end
    assert @mission.reload.paid?
    assert_equal "pi_drone", @mission.stripe_payment_intent_id
  end

  test "delivered, then confirmed by the client: the pilot receives their share" do
    @mission.accept!(flight_on: nil)
    @mission.record_payment!(session_id: "cs_1", payment_intent_id: "pi_1", paid_at: Time.current, livemode: false)
    sign_in_as @pilot_user
    decide("deliver", text: "Orthophoto déposée")
    assert @mission.reload.delivered?

    transfers = []
    with_billing do
      stub_stripe_get("payment_intents/pi_1", { id: "pi_1", latest_charge: "ch_1" })
      stub_stripe_post("transfers", { id: "tr_1" }, log: transfers)
      sign_in_as @client
      decide("confirm")
    end
    assert @mission.reload.completed?
    assert_equal "tr_1", @mission.stripe_transfer_id
    assert_equal @mission.pilot_share_cents.to_s, transfers.sole["amount"]
    assert_equal "ch_1", transfers.sole["source_transaction"]
    assert_equal "acct_bob", transfers.sole["destination"]
  end

  test "a dispute holds the payout and tells Semisto" do
    @mission.accept!(flight_on: nil)
    @mission.record_payment!(session_id: "cs_1", payment_intent_id: "pi_1", paid_at: Time.current, livemode: false)
    @mission.deliver!
    sign_in_as @client
    assert_enqueued_emails 1 do
      decide("dispute", text: "Il manque la moitié du terrain")
    end
    assert @mission.reload.disputed?
    assert_empty DroneMission.payout_due(1.month.from_now)
  end

  test "my missions as a client and as a pilot" do
    sign_in_as @pilot_user
    get drone_missions_path, headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal [ @mission.id ], props["asPilot"].map { _1["id"] }
    assert_empty props["asClient"]
  end
end
