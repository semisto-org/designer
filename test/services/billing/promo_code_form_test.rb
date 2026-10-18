require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Billing::PromoCodeFormTest < ActiveSupport::TestCase
  include BillingTestHelper

  test "suggests readable BETA codes" do
    10.times { assert_match(/\ABETA-[A-HJ-NP-Z2-9]{4}\z/, Billing::PromoCodeForm.suggested_code) }
  end

  test "normalizes the code and defaults to every paid plan but the drone" do
    form = Billing::PromoCodeForm.new(code: "  beta  k7qx ", percent_off: "50")
    assert_equal "BETA-K7QX", form.code
    assert_equal %w[yearly atelier bureau], form.plan_keys
    with_billing { assert form.valid?, form.errors.full_messages.to_sentence }
  end

  test "checks the discount, the months and the dates" do
    with_billing do
      form = Billing::PromoCodeForm.new(code: "OK-1", discount_type: "amount", amount_off: "0", duration: "repeating", duration_in_months: "40",
        max_redemptions: "0", expires_on: Date.yesterday.iso8601)
      assert_not form.valid?
      assert_equal %i[amount_off duration_in_months expires_on max_redemptions], form.errors.attribute_names.sort
      today = Billing::PromoCodeForm.new(code: "OK-1", percent_off: "10", expires_on: Date.current.iso8601)
      assert today.valid?
    end
  end

  test "a promotion code made elsewhere still makes a row" do
    row = Billing::PromoCodeForm.row({ "id" => "promo_9", "code" => "OLD", "active" => false, "promotion" => { "type" => "coupon", "coupon" => "co_9" } })
    assert_equal [ "OLD", false, nil, nil, nil, 0 ], row.values_at(:code, :active, :percentOff, :planKeys, :expiresAt, :paymentsCount)
  end
end
