require "test_helper"

class Relief::GrowingPlantsTest < ActiveSupport::TestCase
  setup do
    @map = Map.create!(name: "Verger", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
  end

  test "each plant point with its adult size, its maturity and when it was planted" do
    planted = @map.features.create!(layer: "plants", kind: "plant", name: "Le grand", geometry: point(lng: 4.9002, lat: 50.3401),
                                    properties: { "species_id" => plant_species(:apple).id, "planted_on" => "2025-11-20", "number" => 4 })
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9003, lat: 50.3402),
                          properties: { "species_id" => plant_species(:alder).id })
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9004, lat: 50.3402),
                          properties: { "species_id" => plant_species(:alder).id }, status: "draft")

    data = Relief::GrowingPlants.new(@map).as_json
    assert_equal "2025-11-20", data[:origin]
    assert_equal Date.current.iso8601, data[:today]
    assert_equal 2, data[:plants].size, "drafts are not part of the design yet"

    apple = data[:plants].first
    assert_equal planted.id, apple[:id]
    assert_in_delta 4.9002, apple[:lng], 1e-6
    assert_equal "sub_canopy", apple[:strata]
    assert_equal 4.5, apple[:heightM]
    assert_equal 4.0, apple[:spreadM]
    assert_equal PlantGrowth.maturity(strata: "sub_canopy", species: plant_species(:apple)).years, apple[:maturityYears]
    assert_equal "2025-11-20", apple[:plantedOn]
    assert_equal "Le grand", apple[:ownName]
    assert_nil apple[:training]

    alder = data[:plants].last
    assert_equal "canopy", alder[:strata]
    assert_equal 20.0, alder[:heightM]
    assert_nil alder[:plantedOn]
  end

  test "a pollard says so: the browser draws it smaller" do
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9002, lat: 50.3401),
                          properties: { "species_id" => plant_species(:alder).id, "training" => "pollard" })
    assert_equal "pollard", Relief::GrowingPlants.new(@map).as_json[:plants].sole[:training]
  end

  test "a grafted tree says its form and rootstock: the browser plants it on its trunk" do
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9002, lat: 50.3401),
                          properties: { "species_id" => plant_species(:alder).id, "graft_form" => "half_standard", "rootstock" => "MM106" })
    graft = Relief::GrowingPlants.new(@map).as_json[:plants].sole[:graft]
    assert_equal({ form: "half_standard", trunkHeight: nil, vigor: nil, rootstock: "MM106" }, graft)
  end

  test "nothing planted yet: year 0 is today" do
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9002, lat: 50.3401),
                          properties: { "species_id" => plant_species(:comfrey).id })
    data = Relief::GrowingPlants.new(@map).as_json
    assert_equal Date.current.iso8601, data[:origin]
    assert_equal "herbaceous", data[:plants].first[:strata]
  end

  test "a plant without species grows as a shrub of default size, flagged as indicative" do
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9002, lat: 50.3401), properties: {})
    plant = Relief::GrowingPlants.new(@map).as_json[:plants].first
    assert_equal "shrub", plant[:strata]
    assert_equal PlantGrowth::HEIGHT_BY_STRATA["shrub"], plant[:heightM]
    assert plant[:indicative]
  end

  test "patches with their outline and lines, capped for the 3D" do
    patch = @map.features.create!(layer: "plants", kind: "patch", name: "Massif", geometry: square(lng: 4.9002, lat: 50.3401, size: 0.0001))
    patch.patch_items.create!(species: plant_species(:comfrey), count: 900)
    patch.patch_items.create!(species: plant_species(:strawberry), count: 300)

    data = Relief::GrowingPlants.new(@map).as_json
    row = data[:patches].sole
    assert_equal "Massif", row[:name]
    assert_equal 5, row[:ring].size
    assert_equal [ 900, 300 ], row[:lines].map { |l| l[:quantity] }
    assert_equal Relief::GrowingPlants::PATCH_LIMIT, row[:lines].sum { |l| l[:shown] }
  end
end
