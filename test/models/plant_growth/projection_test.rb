require "test_helper"

# A plant's size over the years, as the MCP tells it to an AI, and the growth
# inputs the editor's time strip reads in PlantingState.
class PlantGrowth::ProjectionTest < ActiveSupport::TestCase
  setup do
    @map = Map.create!(name: "Verger", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
  end

  def plant(properties = {})
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9002, lat: 50.3401),
                          properties: { "species_id" => plant_species(:apple).id }.merge(properties))
  end

  test "a planted tree: adult size, age today, and its crown today and 1, 5, 15, 30 years after planting" do
    data = PlantGrowth::Projection.new(plant("planted_on" => "2024-11-20"), today: Date.new(2026, 11, 20)).as_json
    assert_equal "sub_canopy", data[:strata]
    # Apple: 3–6 m high, 3–5 m wide (the means), the strata's years to maturity.
    assert_equal({ height_m: 4.5, spread_m: 4.0, maturity_years: PlantGrowth.maturity(strata: "sub_canopy", species: plant_species(:apple)).years }, data[:adult])
    assert_equal "2024-11-20", data[:planted_on]
    assert_in_delta 2.0, data[:age_years], 0.01
    assert_equal %w[1 5 15 30], data[:by_age].keys
    spreads = data[:by_age].values.map { _1[:spread_m] }
    assert_equal spreads, spreads.sort
    assert_operator spreads.last, :<=, 4.0
    expected = PlantGrowth::Curve.size_at(strata: "sub_canopy", height: 4.5, spread: 4.0, maturity: data[:adult][:maturity_years], age: data[:age_years])
    assert_in_delta expected[:spread], data[:today][:spread_m], 0.01
  end

  test "a plant still to plant has no age yet; one found on the land is grown already" do
    planned = PlantGrowth::Projection.new(plant).as_json
    assert_nil planned[:age_years]
    assert_nil planned[:today]
    assert planned[:by_age]["5"]

    old = PlantGrowth::Projection.new(plant("planted_on" => "2026-01-10", "planted_on_precision" => "unknown")).as_json
    assert old[:planted_long_ago]
    assert_in_delta 4.0, old[:today][:spread_m], 0.01
  end

  test "a support plant gives way: no size after its years" do
    data = PlantGrowth::Projection.new(plant("succession" => "support", "support_until" => 10, "planted_on" => "2025-01-10")).as_json
    assert_equal 10, data[:support_until_years]
    assert data[:by_age]["5"]
    assert_nil data[:by_age]["15"]
  end

  test "a pollard stays smaller than the tree left free" do
    free = PlantGrowth::Projection.new(plant).as_json
    pollard = PlantGrowth::Projection.new(plant("training" => "pollard")).as_json
    assert_equal "pollard", pollard[:training]
    assert_operator pollard[:by_age]["30"][:height_m], :<=, free[:by_age]["30"][:height_m]
  end

  test "the planting state gives the time strip each species' growth, drafts included" do
    plant("planted_on" => "2025-11-20")
    @map.features.create!(layer: "plants", kind: "plant", status: "draft", source: "ai", geometry: point(lng: 4.9003, lat: 50.3402),
                          properties: { "species_id" => plant_species(:alder).id })
    growth = PlantingState.new(@map).as_json[:growth]
    assert_equal PlantGrowth.inputs(strata: "sub_canopy", species: plant_species(:apple)), growth["#{plant_species(:apple).id}:"]
    assert growth.key?("#{plant_species(:alder).id}:")
  end
end
