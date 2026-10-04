require "test_helper"

class FinancialPlan::CalculatorTest < ActiveSupport::TestCase
  def calculate(inputs, area_ha: nil) = FinancialPlan::Calculator.new(inputs, area_ha:).call

  def apples(**overrides)
    {
      "name" => "Pommier", "quantity" => 100, "unit_price" => 10, "planting_year" => 1,
      "first_harvest_age" => 3, "full_production_age" => 5, "yield_kg_per_plant" => 10,
      "picking_rate_kg_per_hour" => 20, "loss_pct" => 10, "direct_share_pct" => 100, "direct_price" => 4
    }.merge(overrides)
  end

  def base(**sections) = { "settings" => { "start_year" => 2027, "labour_cost_per_hour" => 15 } }.merge(sections.stringify_keys)

  test "empty plan: 20 years of zeros, no break-even, a warning" do
    result = calculate({})
    assert_equal 20, result.years.size
    assert result.years.all? { _1.revenue.zero? && _1.result.zero? && _1.cumulative_cash.zero? }
    assert_nil result.indicators[:break_even_year]
    assert_nil result.indicators[:payback_year]
    assert_nil result.indicators[:peak_harvest_year]
    assert_equal [ { "code" => "no_species" } ], result.warnings
  end

  test "yield share: nothing before the first harvest, linear ramp, then full" do
    share = ->(age) { FinancialPlan::Calculator.yield_share(age, 3, 5) }
    assert_equal [ 0.0, 0.0, 1 / 3.0, 2 / 3.0, 1.0, 1.0 ], (1..6).map(&share)
    assert_equal 1.0, FinancialPlan::Calculator.yield_share(4, 4, nil), "full production defaults to the first harvest"
    assert_equal 0.0, FinancialPlan::Calculator.yield_share(10, nil, 5), "no first harvest age, no harvest"
  end

  test "one species: harvest, sales, picking time, depreciation and break-even" do
    result = calculate(base(species: [ apples ]))
    year1, year3, year5 = result.years.values_at(0, 2, 4)

    assert_equal 2027, year1.calendar_year
    assert_equal 0.0, year1.harvest_kg
    assert_equal 1000.0, year1.investments
    assert_equal 100.0, year1.depreciation
    assert_in_delta(-100.0, year1.result)
    assert_in_delta(-1000.0, year1.net_cash_flow)

    assert_in_delta 333.333, year3.harvest_kg, 0.001
    assert_in_delta 300.0, year3.sold_kg, 0.001
    assert_in_delta 1200.0, year3.sales, 0.001
    assert_in_delta 16.667, year3.picking_hours, 0.001
    assert_in_delta 250.0, year3.labour_cost, 0.001

    assert_in_delta 1000.0, year5.harvest_kg
    assert_in_delta 3600.0, year5.sales
    assert_in_delta 750.0, year5.labour_cost
    assert_in_delta 2750.0, year5.result
    assert_equal 0.0, result.years[10].depreciation, "plants depreciated over 10 years"

    assert_equal 3, result.indicators[:break_even_year]
    assert_equal 4, result.indicators[:payback_year]
    assert_equal 1000.0, result.indicators[:total_investment]
    assert_equal 1000.0, result.indicators[:funding_need]
    assert_equal 5, result.indicators[:peak_harvest_year]
    assert_equal 50.0, result.indicators[:peak_picking_hours]
    assert_empty result.warnings
    assert_equal [ 0.0, 0.0 ], result.species.first.harvest_kg.first(2)
  end

  test "partial inputs: plants without a yield still cost, and are flagged" do
    result = calculate(base(species: [
      apples(yield_kg_per_plant: nil),
      { "name" => "Noisetier", "quantity" => 20 }
    ]))
    assert_equal 1000.0, result.indicators[:total_investment]
    assert result.years.all? { _1.sales.zero? }
    assert_equal [ "Pommier", "Noisetier" ], result.warnings.find { _1["code"] == "missing_yield" }["names"]
    assert_equal [ "Noisetier" ], result.warnings.find { _1["code"] == "missing_unit_price" }["names"]
  end

  test "late planting shifts the investment and the yield curve" do
    result = calculate(base(species: [ apples(planting_year: 3) ]))
    assert_equal 1000.0, result.years[2].investments
    assert_equal 0.0, result.years[3].harvest_kg
    assert_in_delta 333.333, result.years[4].harvest_kg, 0.001
  end

  test "replacement of lost plants the year after planting" do
    inputs = base(species: [ apples ])
    inputs["settings"]["plant_replacement_pct"] = 10
    result = calculate(inputs)
    assert_equal 100.0, result.years[1].investments
    assert_equal 1100.0, result.indicators[:total_investment]
  end

  test "channel shares: above 100 % scaled down, below 100 % partly unsold" do
    over = calculate(base(species: [ apples(direct_share_pct: 80, restaurant_share_pct: 80, restaurant_price: 6) ])).years[4]
    # 900 kg marketable split 50/50: 450 × 4 + 450 × 6
    assert_in_delta 4500.0, over.sales
    assert_in_delta 900.0, over.sold_kg

    under = calculate(base(species: [ apples(direct_share_pct: 50) ]))
    assert_in_delta 450.0, under.years[4].sold_kg
    assert_in_delta 1800.0, under.years[4].sales
    assert_equal [ "shares_over_100" ], calculate(base(species: [ apples(direct_share_pct: 80, restaurant_share_pct: 80, restaurant_price: 6) ])).warnings.map { _1["code"] }
  end

  test "missing prices, channels, picking rate and labour cost are flagged" do
    codes = ->(inputs) { calculate(inputs).warnings.map { _1["code"] } }
    assert_includes codes.call(base(species: [ apples(direct_price: nil) ])), "missing_price"
    assert_includes codes.call(base(species: [ apples(direct_share_pct: nil) ])), "missing_channels"
    assert_includes codes.call(base(species: [ apples(picking_rate_kg_per_hour: nil) ])), "missing_picking_rate"
    assert_includes codes.call({ "species" => [ apples ] }), "missing_labour_cost"
  end

  test "fixed and variable costs, other revenue and subsidies over their years" do
    result = calculate(base(
      species: [ apples ],
      fixed_costs: [ { "label" => "Assurance", "amount" => 300 }, { "label" => "Fermage", "amount" => 200, "start_year" => 2, "end_year" => 3 } ],
      variable_costs: [
        { "label" => "Emballages", "basis" => "per_kg", "rate" => 0.5 },
        { "label" => "Paillage", "basis" => "per_ha", "rate" => 100, "end_year" => 2 },
        { "label" => "Marché", "basis" => "pct_sales", "rate" => 10 }
      ],
      other_revenues: [ { "label" => "Ateliers", "kind" => "workshops", "amount" => 500, "start_year" => 4 } ],
      subsidies: [ { "label" => "Plantation", "kind" => "hedges", "amount" => 2000, "start_year" => 1, "end_year" => 1 }, { "label" => "PAC", "kind" => "pac", "amount" => 150 } ]
    ), area_ha: 2)
    year1, year2, year5 = result.years.values_at(0, 1, 4)

    assert_equal 2150.0, year1.subsidies
    assert_equal 150.0, year2.subsidies
    assert_equal 500.0, year2.fixed_costs
    assert_equal 300.0, year5.fixed_costs
    assert_equal 200.0, year1.variable_costs, "per hectare from the map area"
    assert_equal 0.0, result.years[2].other_revenue
    assert_equal 500.0, result.years[3].other_revenue
    # year 5: 900 kg sold × 0.5 + 10 % of 3600 €
    assert_in_delta 810.0, year5.variable_costs
    assert_in_delta 3600 + 500 + 150, year5.revenue
    assert_equal 2000.0 + 150 * 20, result.indicators[:total_subsidies]
  end

  test "settings area wins over the map area; carbon needs an area" do
    carbon = { "enabled" => true, "t_co2_per_ha_year" => 2, "price_per_t" => 50, "start_year" => 3 }
    with_area = calculate(base(carbon:, settings: { "area_ha" => 1.5 }), area_ha: 10)
    assert_equal 0.0, with_area.years[1].carbon
    assert_equal 150.0, with_area.years[2].carbon
    assert_equal 1.5, with_area.indicators[:area_ha]

    without = calculate({ "carbon" => carbon })
    assert without.years.all? { _1.carbon.zero? }
    assert_includes without.warnings.map { _1["code"] }, "missing_area"
    assert calculate(base(carbon: carbon.merge("enabled" => false)), area_ha: 1).years.all? { _1.carbon.zero? }
  end

  test "loans: annuities split into interest (P&L) and principal (cash)" do
    flat = calculate(base(loans: [ { "amount" => 10_000, "rate_pct" => 0, "years" => 5 } ]))
    assert_equal 10_000.0, flat.years[0].loan_received
    assert_equal [ 2000.0 ] * 5 + [ 0.0 ], flat.years.first(6).map(&:loan_repaid)
    assert flat.years.all? { _1.interest.zero? }

    bank = calculate(base(loans: [ { "amount" => 10_000, "rate_pct" => 5, "years" => 10 } ]))
    assert_in_delta 500.0, bank.years[0].interest, 0.01
    assert_in_delta 795.05, bank.years[0].loan_repaid, 0.01
    assert_in_delta 10_000.0, bank.years.first(10).sum(&:loan_repaid), 0.01
    assert_in_delta 0.0, bank.indicators[:loan_balance_end], 0.01
    assert_in_delta(-500.0, bank.years[0].result, 0.01)

    late = calculate(base(loans: [ { "amount" => 10_000, "rate_pct" => 0, "years" => 10, "start_year" => 16 } ]))
    assert_in_delta 5000.0, late.indicators[:loan_balance_end]
  end

  test "investments: depreciation over their own duration, cut at the horizon" do
    result = calculate(base(investments: [
      { "label" => "Clôture", "category" => "fencing", "amount" => 5000, "year" => 1 },
      { "label" => "Tracteur", "category" => "equipment", "amount" => 3000, "year" => 18, "depreciation_years" => 10 }
    ]))
    assert_equal 500.0, result.years[0].depreciation
    assert_equal 0.0, result.years[10].depreciation
    assert_equal 300.0, result.years[19].depreciation
    assert_equal({ "fencing" => 5000.0, "equipment" => 3000.0 }, result.indicators[:investment_by_category])
  end

  test "opening cash, lowest point and funding need" do
    inputs = base(investments: [ { "amount" => 8000, "year" => 2 } ], other_revenues: [ { "amount" => 1000 } ])
    inputs["settings"]["opening_cash"] = 2000
    result = calculate(inputs)
    assert_equal 3000.0, result.years[0].cumulative_cash
    assert_equal(-4000.0, result.years[1].cumulative_cash)
    assert_equal 2, result.indicators[:lowest_cash_year]
    assert_equal 4000.0, result.indicators[:funding_need]
    assert_equal 2000.0 + 20_000 - 8000, result.indicators[:final_cash]
  end

  test "break-even needs the result to stay positive" do
    inputs = base(other_revenues: [ { "amount" => 1000, "end_year" => 2 }, { "amount" => 1000, "start_year" => 6 } ], fixed_costs: [ { "amount" => 500 } ])
    assert_equal 6, calculate(inputs).indicators[:break_even_year]
    never = base(fixed_costs: [ { "amount" => 500 } ])
    assert_nil calculate(never).indicators[:break_even_year]
  end

  test "JSON output is rounded and camelCased" do
    json = calculate(base(species: [ apples ])).as_json
    year3 = json["years"][2]
    assert_equal 333.3, year3["harvestKg"]
    assert_equal 16.7, year3["pickingHours"]
    assert_equal 2029, year3["calendarYear"]
    assert_equal 3, json["indicators"]["breakEvenYear"]
    assert_equal [ 0.0, 0.0, 333.3 ], json["species"].first["harvestKg"].first(3)
  end
end
