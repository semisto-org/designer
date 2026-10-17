require "test_helper"

class PlantHarvestTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @apple = plant(species: plant_species(:apple), variety: plant_varieties(:reinette), name: "n° 7 — Pommier")
  end

  test "a look at the tree and a harvest, with the plant's species and variety copied" do
    seen = @apple.plant_harvests.create!(noted_on: Date.new(2026, 7, 1), stage: "on_tree", amount: "heavy")
    picked = @apple.plant_harvests.create!(noted_on: Date.new(2026, 10, 12), stage: "picked", amount: "normal", quantity_kg: 42.5, uses: %w[juice storage juice])

    assert_equal @map, seen.map
    assert_equal plant_species(:apple), picked.species
    assert_equal plant_varieties(:reinette), picked.variety
    assert_equal %w[juice storage], picked.uses
    assert seen.bore?
    assert_equal 2026, picked.season
  end

  test "a look at the tree says how much fruit; a harvest is never « no fruit »" do
    refute @apple.plant_harvests.new(noted_on: Date.current, stage: "on_tree").valid?
    assert @apple.plant_harvests.new(noted_on: Date.current, stage: "on_tree", amount: "none").valid?
    refute @apple.plant_harvests.new(noted_on: Date.current, stage: "picked", amount: "none").valid?
    assert @apple.plant_harvests.new(noted_on: Date.current, stage: "picked").valid?
  end

  test "uses and weight belong to a harvest" do
    look = @apple.plant_harvests.new(noted_on: Date.current, stage: "on_tree", amount: "light", uses: %w[juice], quantity_kg: 3)
    refute look.valid?
    assert look.errors.of_kind?(:uses, :present)
    assert look.errors.of_kind?(:quantity_kg, :present)
    refute @apple.plant_harvests.new(noted_on: Date.current, stage: "picked", uses: %w[cider]).valid?
  end

  test "never in the future, only on plants" do
    refute @apple.plant_harvests.new(noted_on: Date.current + 3, stage: "picked").valid?
    pond = map_features(:pond)
    refute PlantHarvest.new(map_feature: pond, noted_on: Date.current, stage: "picked").valid?
  end

  test "removing the plant removes its log" do
    @apple.plant_harvests.create!(noted_on: Date.current, stage: "picked")
    assert_difference -> { PlantHarvest.count }, -1 do
      @apple.destroy!
    end
  end

  private
    def plant(species:, variety: nil, name: nil, planted_on: nil)
      properties = { "species_id" => species.id, "variety_id" => variety&.id, "planted_on" => planted_on&.iso8601 }.compact
      @map.features.create!(layer: "plants", kind: "plant", name:, geometry: point, properties:)
    end
end
