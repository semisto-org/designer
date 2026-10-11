require "test_helper"

class OfferTest < ActiveSupport::TestCase
  # The Erpent offer (October 2026): 20 ares of forest garden, and as
  # extensions a multirow hedge, a double row of trees and a herbaceous
  # zone. Two designers for the pre-design, one for the design.
  ERPENT = {
    "settings" => { "designers" => 2 },
    "services" => %w[co_author soil_analysis existing_trees sun_study expert_opinion harvest_table wildlife pond mushrooms].index_with(true),
    "scope" => [
      { "label" => "Jardin-forêt", "planting_type" => "forest_garden", "measure" => 2_000 },
      { "label" => "Haie persistante", "planting_type" => "hedge_multirow", "measure" => 145, "option" => true },
      { "label" => "Double alignement", "planting_type" => "tree_row_double", "measure" => 75, "option" => true },
      { "label" => "Herbacées", "planting_type" => "herbaceous_zone", "measure" => 60, "option" => true }
    ],
    "trips" => [
      { "phase" => "pre_design", "label" => "Depuis Dave", "trips" => 3, "one_way_km" => 6 },
      { "phase" => "pre_design", "label" => "Ailleurs", "trips" => 2, "one_way_km" => 30 },
      { "phase" => "pre_design", "label" => "Depuis Yvoir", "trips" => 1, "one_way_km" => 21 },
      { "phase" => "design", "trips" => 2, "one_way_km" => 6 },
      { "phase" => "implementation", "trips" => 4, "one_way_km" => 6 }
    ]
  }.freeze

  setup do
    @map = maps(:ahinvaux)
    @map.update_columns(area_m2: 30_920.5)
  end

  def phase(offer, key) = offer.result["phases"].find { _1["key"] == key }

  test "the Erpent measures give back the spreadsheet for the pre-design and the design" do
    offer = Offer.new(map: @map, inputs: ERPENT)

    pre = phase(offer, "pre_design")
    assert_equal 54, pre["hours_min"]
    assert_equal 3_726.0, pre["fees_min"]
    assert_equal 3_969.06, pre["total_min"]

    design = phase(offer, "design")
    assert_equal 39, design["hours_min"]
    assert_equal 2_752.28, design["total_min"]

    assert_equal 510, offer.result["plants"]["count_base"]
    assert_equal 5_250.0, offer.result["plants"]["categories"].sum { _1["amount_base"] }
  end

  test "hours follow the map: more plants, a longer planting plan and more planting days" do
    small = Offer.new(map: @map, inputs: ERPENT)
    big = Offer.new(map: @map, inputs: ERPENT.merge("scope" => [ { "planting_type" => "forest_garden", "measure" => 8_000 } ]))

    plan = ->(offer) { phase(offer, "design")["lines"].find { _1["task"] == "planting_plan" } }
    assert_equal 12, plan.(small)["hours"]
    assert_equal 43, plan.(big)["hours"] # 2 h + 0.02 h × 2 040 plants, to the half hour
    assert_equal({ "base" => 2, "per" => 0.02, "driver" => "plants", "value" => 2_040.0 }, plan.(big)["formula"])

    days = ->(offer) { phase(offer, "implementation")["lines"].find { _1["task"] == "planting_days" }["hours"] }
    assert_equal 20, days.(small)  # 2 days
    assert_equal 50, days.(big)    # 7 days
  end

  test "options and the buffer make the maximum, adjustments move both" do
    offer = Offer.new(map: @map, inputs: ERPENT)
    design = phase(offer, "design")
    # Optional planting plan: 0.02 h × 727 plants of the extensions.
    assert_equal 39 + 14.5 + 2 + 4 + 1, design["hours_max"]
    assert_in_delta (39 + 14.5 + 2 + 4 + 1) * 60 * 1.15 * 1.2 + 61.28, design["total_max"], 0.01

    adjusted = Offer.new(map: @map, inputs: ERPENT.merge("adjustments" => [ { "preset" => "complex_project" } ]))
    assert_equal 10, phase(adjusted, "pre_design")["adjustment_pct"]
    assert_in_delta 3_726 * 1.1, phase(adjusted, "pre_design")["fees_min"], 0.01
  end

  test "the team corrects a line, disables another, adds its own and sets the price" do
    inputs = ERPENT.merge(
      "lines" => [ { "key" => "pre_design.offer", "hours" => 2 }, { "key" => "pre_design.research", "disabled" => true } ],
      "custom_lines" => [ { "phase" => "pre_design", "kind" => "hours", "label" => "Visite du chalet", "hours" => 2 } ],
      "prices" => { "pre_design" => { "fees" => 4_500, "expenses" => 320 } }
    )
    pre = phase(Offer.new(map: @map, inputs:), "pre_design")
    offer_line = pre["lines"].find { _1["task"] == "offer" }
    assert offer_line["overridden"]
    assert_equal 3, offer_line["computed_hours"]
    assert_equal 54 - 2 - 4 + 2, pre["hours_min"]
    assert_equal({ "fees" => 4_500.0, "expenses" => 320.0 }, pre["prices"])
    assert_equal 4_820.0, pre["price_tvac"]
  end

  test "computed prices are rounded TVAC, and a price far below the computation is flagged" do
    offer = Offer.new(map: @map, inputs: ERPENT)
    assert_equal({ "fees" => 4_510.0, "expenses" => 295.0 }, phase(offer, "pre_design")["computed_prices"])

    cheap = Offer.new(map: @map, inputs: ERPENT.merge("prices" => { "design" => { "fees" => 1_000 } }))
    assert_includes cheap.result["warnings"], { "code" => "price_below_computed", "phase" => "design", "part" => "fees" }
  end

  test "services follow the map and the project sheet until the team decides" do
    @map.features.create!(layer: "water", kind: "pond", geometry: square(size: 0.0001))
    offer = Offer.new(map: @map, inputs: {})
    assert offer.measures.service?("pond")
    assert_equal "pond_drawn", offer.measures.suggestions["pond"]
    assert phase(offer, "design")["lines"].any? { _1["task"] == "pond_design" }

    offer.inputs = { "services" => { "pond" => false } }
    assert_not offer.measures.service?("pond")
  end

  test "a new offer takes the planting surfaces and hedges drawn on the map" do
    patch = @map.features.create!(layer: "plants", kind: "patch", name: "Lisière", geometry: square(size: 0.0005))
    hedge = @map.features.create!(layer: "structures", kind: "hedge", geometry: { "type" => "LineString", "coordinates" => [ [ 4.9, 50.34 ], [ 4.902, 50.34 ] ] })
    @map.features.create!(layer: "existing", kind: "existing_hedge", geometry: { "type" => "LineString", "coordinates" => [ [ 4.9, 50.341 ], [ 4.901, 50.341 ] ] })

    offer = Offer.build_for(@map)
    assert_equal [ [ patch.id, "forest_garden" ], [ hedge.id, "hedge_multirow" ] ], offer.inputs["scope"].map { _1.values_at("feature_id", "planting_type") }
    assert_equal %w[pre_design design implementation], offer.inputs["trips"].map { _1["phase"] }

    item = offer.measures.scope.first
    assert_equal "Lisière", item["label"]
    assert_in_delta 1_976, item["measure"], 30 # 0.0005° × 0.0005° at 50.34° N
    assert_in_delta 142, offer.measures.scope.second["measure"], 2
  end

  test "an element removed from the map is flagged, not silently priced at zero" do
    offer = Offer.new(map: @map, inputs: { "scope" => [ { "feature_id" => 999_999, "label" => "Verger" } ] })
    assert offer.measures.scope.first["missing"]
    assert_includes offer.result["warnings"], { "code" => "missing_feature", "label" => "Verger" }
  end

  test "the plants of an element can be set by hand, in the same proportions" do
    offer = Offer.new(map: @map, inputs: { "scope" => [ { "planting_type" => "forest_garden", "measure" => 2_000, "plants_override" => 300 } ] })
    assert_equal 300, offer.measures.scope.first["plants_total"]
  end

  test "trips without a distance are flagged" do
    offer = Offer.new(map: @map, inputs: { "trips" => [ { "phase" => "design", "trips" => 2 } ] })
    assert_includes offer.result["warnings"], { "code" => "trip_without_km", "phase" => "design" }
  end

  test "an offer over the project sheet's budget bracket is flagged" do
    @map.update!(project: { "budget" => { "initial" => "up_to_5000" } })
    offer = Offer.new(map: @map, inputs: ERPENT)
    assert_includes offer.result["warnings"], { "code" => "over_budget", "ceiling" => 5_000 }
  end

  test "versions freeze the offer and the team can start again from one" do
    user = users(:michael)
    offer = Offer.create!(map: @map, inputs: ERPENT)
    v1 = offer.save_version!(user:, note: "Première proposition")
    offer.update!(inputs: ERPENT.merge("settings" => { "designers" => 1 }))
    v2 = offer.save_version!(user:)

    assert_equal [ 1, 2 ], offer.versions.map(&:number)
    assert_equal "V2", v2.label
    assert_equal 3_969.06, v1.result["phases"].first["total_min"]
    assert_operator v2.result["phases"].first["total_min"], :<, 3_969.06
    assert_equal 510, v1.measures["drivers"]["plants"]

    offer.restore!(v1, user:)
    assert_equal 2, offer.reload.inputs["settings"]["designers"]
  end

  test "inputs are normalised" do
    offer = Offer.new(map: @map, inputs: {
      "settings" => { "hourlyRate" => "65,5", "designers" => 7 },
      "scope" => [ { "plantingType" => "nope", "measure" => "abc" } ],
      "unknown" => 1
    })
    assert_equal 65.5, offer.inputs["settings"]["hourly_rate"]
    assert_equal 2, offer.inputs["settings"]["designers"]
    assert_equal "forest_garden", offer.inputs["scope"].first["planting_type"]
    assert_nil offer.inputs["scope"].first["measure"]
    assert_not offer.inputs.key?("unknown")
  end
end
