require "test_helper"
require "test_helpers/drone_pilots_test_helper"

class DronePilotTest < ActiveSupport::TestCase
  include DronePilotsTestHelper
  include ActionMailer::TestHelper

  setup { @map = maps(:ahinvaux) }

  test "a complete application is valid, and Semisto is told" do
    assert_enqueued_emails 1 do
      create_pilot(users(:bob), status: "pending")
    end
  end

  test "the data delivered must come from the pilot's drones" do
    pilot = DronePilot.new(drones: [ { "model" => "mini" } ], data_types: %w[photos thermal])
    pilot.valid?
    assert_match "Image thermique", pilot.errors[:data_types].join
    pilot.drones = [ { "model" => "mavic_3_thermal" } ]
    pilot.valid?
    assert_empty pilot.errors[:data_types]
  end

  test "another drone needs a name, and the operator number has the European shape" do
    pilot = DronePilot.new(drones: [ { "model" => "other", "name" => "" } ], operator_number: "12")
    pilot.valid?
    assert pilot.errors.of_kind?(:drones, :other_unnamed)
    assert pilot.errors.of_kind?(:operator_number, :invalid)
    assert_equal "BEL12A3B4C5D6E", DronePilot.new(operator_number: "bel 12a3 b4c5 d6e").operator_number
  end

  test "only businesses are listed: a business number is always required" do
    pilot = DronePilot.new(legal_form: "individual")
    pilot.valid?
    assert pilot.errors.of_kind?(:business_number, :blank)
    assert pilot.errors.of_kind?(:legal_form, :inclusion)
    assert_empty pilot.errors[:tax_number]
    assert_empty pilot.errors[:birth_date]
  end

  test "distance, range and travel fees from the base to a map" do
    pilot = create_pilot(users(:bob))
    distance = pilot.distance_km_to(@map)
    assert_in_delta 14, distance, 2
    assert pilot.serves?(@map)
    assert_equal (distance * 2 * DronePilot::ROAD_FACTOR).ceil, pilot.travel_km_to(@map)
    pilot.service_radius_km = 10
    refute pilot.serves?(@map)
    pilot.travel_fees_enabled = false
    assert_equal 0, pilot.travel_km_to(@map)
  end

  test "the quote: Semisto keeps 20 % of the flat price before VAT, never of the travel fees, plus Belgian VAT" do
    pilot = create_pilot(users(:bob))
    quote = pilot.quote_for(@map)
    assert_equal 350_00, quote.price_cents
    assert_equal quote.travel_km * 50, quote.travel_cents
    assert_equal 70_00, quote.commission_cents, "VAT exempt: the price has no VAT in it"
    assert_equal 14_70, quote.commission_vat_cents, "Belgian pilot: 21 % on the commission"
    assert_equal 84_70, quote.semisto_cents
    assert_equal quote.price_cents + quote.travel_cents - 84_70, quote.pilot_share_cents

    pilot.update!(charges_vat: true, vat_number: "BE0123456789")
    quote = pilot.quote_for(@map)
    assert_equal 57_85, quote.commission_cents, "20 % of 350 / 1.21"
    assert_equal 12_15, quote.commission_vat_cents

    pilot.update!(country: "FR", vat_number: "FR12345678901")
    quote = pilot.quote_for(@map)
    assert_equal 58_33, quote.commission_cents, "20 % of 350 / 1.20"
    assert_equal 0, quote.commission_vat_cents, "reverse charge outside Belgium"
  end

  test "charging VAT or working outside Belgium needs a VAT number" do
    pilot = create_pilot(users(:bob))
    pilot.charges_vat = true
    refute pilot.valid?
    assert pilot.errors.of_kind?(:vat_number, :blank)
    pilot.charges_vat = false
    pilot.country = "LU"
    refute pilot.valid?
    pilot.vat_number = "LU12345678"
    assert pilot.valid?, pilot.errors.full_messages.to_sentence
  end

  test "listed once approved, and with payments on, only once Stripe can pay them" do
    pilot = create_pilot(users(:bob), payouts_enabled: false)
    assert pilot.listed?, "billing off: approved is enough"
    with_env("STRIPE_SECRET_KEY" => "sk_test_123") do
      refute pilot.listed?
      refute_includes DronePilot.listed, pilot
      pilot.sync_stripe_account!({ "payouts_enabled" => true, "details_submitted" => true,
                                   "capabilities" => { "transfers" => "active", "card_payments" => "active" } })
      assert pilot.listed?
      assert pilot.bookable?
    end
  end

  test "approve, reject and resubmit" do
    pilot = create_pilot(users(:bob), status: "pending")
    pilot.reject!(by: users(:michael), note: "L'assurance manque.")
    assert_equal "rejected", pilot.status
    pilot.resubmit!
    assert pilot.pending?
    assert_enqueued_emails 1 do
      pilot.approve!(by: users(:michael))
    end
    assert pilot.approved?
    assert_nil pilot.review_note
  end

  private
    def with_env(values)
      saved = values.keys.index_with { ENV[_1] }
      values.each { ENV[_1] = _2 }
      yield
    ensure
      saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    end
end
