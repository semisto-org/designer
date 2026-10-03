require "test_helper"
require_relative "../test_helpers/plant_stubs"

class FinancialPlanTest < ActiveSupport::TestCase
  include PlantStubs

  setup do
    @map = maps(:ahinvaux)
    @map.update_columns(area_m2: 37_000.0)
  end

  test "inputs are stored normalised" do
    plan = FinancialPlan.create!(map: @map, inputs: { "settings" => { "areaHa" => "2,5" }, "species" => [ { "name" => "Pommier", "quantity" => "10" } ] })
    plan.reload
    assert_equal 2.5, plan.inputs["settings"]["area_ha"]
    assert_equal 10, plan.inputs["species"].first["quantity"]
    assert_equal FinancialPlan::SCHEMA_VERSION, plan.schema_version
  end

  test "one plan per map" do
    FinancialPlan.create!(map: @map)
    assert_not FinancialPlan.new(map: @map).valid?
  end

  test "a new plan is prefilled from the map, without yields or prices" do
    apple = species(id: 7, latin_name: "Malus domestica", common_name: "Pommier", production_start_year: 4, maturity_years: 8)
    inventory = MapPlantInventory.new(@map, palette: [ palette_item(id: 1, common_name: "Pommier", quantity: 25, plant_species: apple) ])
    plan = FinancialPlan.build_for(@map, inventory:)

    assert plan.new_record?
    settings = plan.inputs["settings"]
    assert_equal Date.current.year + 1, settings["start_year"]
    assert_equal 3.7, settings["area_ha"]
    line = plan.inputs["species"].sole
    assert_equal [ "palette-1", "Pommier", "Malus domestica", 25, 4, 8 ], line.values_at("source_key", "name", "latin_name", "quantity", "first_harvest_age", "full_production_age")
    assert_nil line["yield_kg_per_plant"]
    assert_nil line["direct_price"]
    assert_nil line["unit_price"]
  end

  test "growth timing of restricted provenance is not prefilled" do
    restricted = species(id: 1, latin_name: "Malus domestica", production_start_year: 4)
    restricted.define_singleton_method(:provenance_for) { |_field| "Rekentool 5.0" }
    inventory = MapPlantInventory.new(@map, palette: [ palette_item(id: 1, quantity: 1, plant_species: restricted) ])
    assert_nil FinancialPlan.build_for(@map, inventory:).inputs["species"].sole["first_harvest_age"]
  end

  test "sync brings new plants and quantities, and keeps the user's figures" do
    plan = FinancialPlan.create!(map: @map, inputs: { "species" => [ { "source_key" => "palette-1", "name" => "Pommier", "quantity" => 10, "yield_kg_per_plant" => 30 } ] })
    inventory = MapPlantInventory.new(@map, palette: [
      palette_item(id: 1, common_name: "Pommier", quantity: 12),
      palette_item(id: 2, common_name: "Noisetier", quantity: 40)
    ])
    assert_equal({ added: 1, updated: 1 }, plan.sync_species(inventory))
    apple, hazel = plan.inputs["species"]
    assert_equal [ 12, 30.0 ], apple.values_at("quantity", "yield_kg_per_plant")
    assert_equal [ "palette-2", 40 ], hazel.values_at("source_key", "quantity")
    assert_equal({ added: 0, updated: 0 }, plan.sync_species(inventory))
  end

  test "result uses the map area when the plan has none" do
    plan = FinancialPlan.new(map: @map, inputs: { "variable_costs" => [ { "basis" => "per_ha", "rate" => 1000 } ] })
    assert_in_delta 3700.0, plan.result.years.first.variable_costs, 0.01
  end
end
