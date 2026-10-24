require "test_helper"
require "test_helpers/drone_pilots_test_helper"

class DroneMissionTest < ActiveSupport::TestCase
  include DronePilotsTestHelper
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @client = users(:michael)
    @pilot = create_pilot(users(:bob))
  end

  test "a request freezes the quote and tells the pilot" do
    mission = nil
    assert_enqueued_emails(1) { mission = request_mission(pilot: @pilot, client: @client, map: @map) }
    assert mission.requested?
    assert_equal @pilot.quote_for(@map).as_json, mission.quote.as_json
    @pilot.update!(mission_price_cents: 900_00)
    assert_equal 350_00, mission.reload.price_cents
  end

  test "a request needs a map the client edits, in the pilot's range, and something the pilot delivers" do
    viewer = DroneMission.new(client: users(:alice), drone_pilot: @pilot, map: @map, data_types: %w[orthophoto], message: "Bonjour")
    refute viewer.valid?
    assert viewer.errors.of_kind?(:map, :not_editable)

    @pilot.update!(service_radius_km: 5)
    far = DroneMission.new(client: @client, drone_pilot: @pilot, map: @map, data_types: %w[elevation], message: "Bonjour")
    refute far.valid?
    assert far.errors.of_kind?(:map, :out_of_range)
    assert far.errors.of_kind?(:data_types, :not_offered)

    @pilot.update!(service_radius_km: 500, country: "FR", vat_number: "FR12345678901")
    abroad = DroneMission.new(client: @client, drone_pilot: @pilot, map: @map, data_types: %w[orthophoto], message: "Bonjour")
    refute abroad.valid?
    assert abroad.errors.of_kind?(:map, :other_country)
  end

  test "a pilot cannot book themselves, nor a pilot who is not listed" do
    own = DroneMission.new(client: users(:bob), drone_pilot: @pilot, map: @map, data_types: %w[orthophoto], message: "Bonjour")
    own.valid?
    assert own.errors.of_kind?(:drone_pilot, :yourself)
    @pilot.update!(status: "suspended", review_note: "Assurance expirée")
    other = DroneMission.new(client: @client, drone_pilot: @pilot, map: @map, data_types: %w[orthophoto], message: "Bonjour")
    other.valid?
    assert other.errors.of_kind?(:drone_pilot, :not_listed)
  end

  test "the pilot reads the map while the mission is open, and delivers once it is paid" do
    mission = request_mission(pilot: @pilot, client: @client, map: @map)
    assert_equal "viewer", @map.role_for(users(:bob))
    refute mission.deliverable_by?(users(:bob))
    mission.accept!(flight_on: Date.new(2027, 2, 15), reply: "Avec plaisir")
    assert mission.record_payment!(session_id: "cs_1", payment_intent_id: "pi_1", paid_at: Time.current, livemode: false)
    refute mission.record_payment!(session_id: "cs_1", payment_intent_id: "pi_1", paid_at: Time.current, livemode: false), "once only"
    assert mission.deliverable_by?(users(:bob))
    refute mission.deliverable_by?(@client)
    assert_raises(DroneMission::InvalidTransition) { mission.decline!(reply: "trop tard") }
    assert mission.paid?
  end

  test "a declined mission closes, and the pilot no longer reads the map" do
    mission = request_mission(pilot: @pilot, client: @client, map: @map)
    mission.decline!(reply: "Je ne vole pas en février.")
    assert mission.declined?
    assert_nil @map.role_for(users(:bob))
    assert_raises(DroneMission::InvalidTransition) { mission.accept!(flight_on: nil) }
  end

  test "payouts are due a week after delivery, unless the client disputes it" do
    mission = paid_mission(pilot: @pilot, client: @client, map: @map)
    mission.deliver!(note: "Orthophoto et thermique déposées")
    refute mission.payout_due?
    assert mission.payout_due?(8.days.from_now)
    mission.dispute!(message: "Il manque le thermique")
    refute mission.payout_due?(8.days.from_now)
    assert_empty DroneMission.payout_due(8.days.from_now)
  end
end
