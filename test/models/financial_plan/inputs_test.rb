require "test_helper"

class FinancialPlan::InputsTest < ActiveSupport::TestCase
  test "empty or invalid documents give a complete, empty document" do
    [ nil, {}, "", "not json", [ 1, 2 ] ].each do |raw|
      document = FinancialPlan::Inputs.from(raw).to_h
      assert_equal %w[settings carbon species investments fixed_costs variable_costs other_revenues subsidies loans], document.keys
      assert_equal Date.current.year, document["settings"]["start_year"]
      assert_equal 10, document["settings"]["plant_depreciation_years"]
      assert_equal false, document["carbon"]["enabled"]
      assert_equal [], document["species"]
    end
  end

  test "numbers: French decimals accepted, garbage becomes nil (never 0), ranges clamped" do
    line = FinancialPlan::Inputs.from("species" => [ {
      "quantity" => "1 200", "unitPrice" => "12,50", "yieldKgPerPlant" => "beaucoup",
      "lossPct" => 140, "directSharePct" => -5, "planting_year" => 42,
      "first_harvest_age" => 6, "full_production_age" => 3, "picking_rate_kg_per_hour" => Float::INFINITY
    } ]).species.first
    assert_equal 1200, line.quantity
    assert_equal 12.5, line.unit_price
    assert_nil line.yield_kg_per_plant
    assert_equal 100.0, line.loss_pct
    assert_equal 0.0, line.direct_share_pct
    assert_equal 20, line.planting_year
    assert_equal 6, line.full_production_age, "full production cannot come before the first harvest"
    assert_nil line.picking_rate_kg_per_hour
    assert_match(/\A[\w-]+\z/, line.id)
  end

  test "rows keep their ids, unknown keys and enums are cleaned" do
    document = FinancialPlan::Inputs.from(
      "investments" => [ { "id" => "inv-1", "category" => "rocket", "amount" => 100, "admin" => true } ],
      "subsidies" => [ { "id" => "<script>", "kind" => "pac", "amount" => 50, "start_year" => 5, "end_year" => 2 } ],
      "variableCosts" => [ { "basis" => "pct_sales", "rate" => 250 } ]
    ).to_h
    investment = document["investments"].first
    assert_equal "inv-1", investment["id"]
    assert_equal "other", investment["category"]
    assert_not investment.key?("admin")
    subsidy = document["subsidies"].first
    assert_not_equal "<script>", subsidy["id"]
    assert_equal [ 5, 5 ], [ subsidy["start_year"], subsidy["end_year"] ]
    assert_equal 100.0, document["variable_costs"].first["rate"]
  end

  test "lists are capped" do
    document = FinancialPlan::Inputs.from("loans" => Array.new(50) { { "amount" => 1 } })
    assert_equal 20, document.loans.size
  end

  test "camelCase round trip from the frontend" do
    raw = { "settings" => { "startYear" => 2030, "areaHa" => "0,5" }, "carbon" => { "enabled" => "true", "tCo2PerHaYear" => 3 } }
    document = FinancialPlan::Inputs.from(raw).to_h
    assert_equal 2030, document["settings"]["start_year"]
    assert_equal 0.5, document["settings"]["area_ha"]
    assert_equal true, document["carbon"]["enabled"]
    assert_equal 3.0, document["carbon"]["t_co2_per_ha_year"]
    camel = document.deep_transform_keys { _1.camelize(:lower) }
    assert_equal document, FinancialPlan::Inputs.from(camel).to_h
  end
end
