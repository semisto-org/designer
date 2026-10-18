require "test_helper"

class Billing::CatalogTest < ActiveSupport::TestCase
  test "Pro and Team cost ten months a year, eleven months off in the first year of the launch offer" do
    pro = Billing::Catalog.fetch("atelier")
    team = Billing::Catalog.fetch("bureau")
    assert_equal [ 4_900, 49_000, 44_100 ], [ pro.price_cents, pro.yearly_price_cents, pro.launch_price_cents ]
    assert_equal [ 12_900, 129_000, 116_100 ], [ team.price_cents, team.yearly_price_cents, team.launch_price_cents ]
    assert_nil Billing::Catalog.fetch("yearly").yearly_price_cents
  end

  test "Home costs 59 € for members; the drone mission 380 €" do
    assert_equal 5_900, Billing::Catalog.member_price_cents
    assert_equal 38_000, Billing::Catalog.fetch("drone").price_cents
  end

  test "the launch offer ends at midnight on 31 December 2026 in Brussels" do
    assert Billing::Catalog.launch_offer?(Time.find_zone("Europe/Brussels").local(2026, 12, 31, 23, 59))
    refute Billing::Catalog.launch_offer?(Time.find_zone("Europe/Brussels").local(2027, 1, 1))
    travel_to(Time.find_zone("Europe/Brussels").local(2027, 1, 2)) do
      assert_nil Billing::Catalog.as_json.find { _1[:key] == "atelier" }[:launchPriceCents]
    end
  end

  test "a yearly price id is found back to its plan" do
    with_env("STRIPE_PRICE_ATELIER_YEARLY" => "price_atelier_yearly") do
      assert_equal "atelier", Billing::Catalog.plan_key_for_price("price_atelier_yearly")
    end
  end

  def with_env(values)
    saved = values.keys.index_with { ENV[_1] }
    values.each { ENV[_1] = _2 }
    yield
  ensure
    saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end
end
