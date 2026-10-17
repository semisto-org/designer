require "test_helper"

class Maps::HarvestsControllersTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @apples = 2.times.map { |i| @map.features.create!(layer: "plants", kind: "plant", name: "n° #{i + 1} — Pommier", geometry: point, properties: { "species_id" => plant_species(:apple).id, "planted_on" => "2015-03-01" }) }
  end

  test "an editor notes the harvest of one tree, reads it back and removes it" do
    sign_in_as users(:michael)
    post map_feature_plant_harvests_path(@map, @apples.first), params: { plant_harvest: { noted_on: Date.current.iso8601, stage: "picked", amount: "normal", uses: %w[juice], quantity_kg: "12.5" } }, as: :json
    assert_response :created
    body = response.parsed_body
    assert_equal "picked", body["harvest"]["stage"]
    assert_equal 12.5, body["harvest"]["quantityKg"]
    assert_equal "picked", body["plant"]["seasons"][Date.current.year.to_s]["status"]
    assert_equal 1, body["harvests"].size

    delete map_feature_plant_harvest_path(@map, @apples.first, body["harvest"]["id"]), as: :json
    assert_response :success
    assert_empty response.parsed_body["harvests"]
  end

  test "an invalid line is refused with its reason" do
    sign_in_as users(:michael)
    post map_feature_plant_harvests_path(@map, @apples.first), params: { plant_harvest: { noted_on: Date.current.iso8601, stage: "on_tree" } }, as: :json
    assert_response :unprocessable_entity
    assert response.parsed_body["errors"]["amount"]
  end

  test "several trees picked the same day, all or nothing" do
    sign_in_as users(:michael)
    assert_difference -> { PlantHarvest.count }, 2 do
      post map_harvests_path(@map), params: { feature_ids: @apples.map(&:id), plant_harvest: { noted_on: "2026-10-12", stage: "picked", uses: %w[juice] } }, as: :json
    end
    assert_response :created
    assert_equal 2, response.parsed_body["created"]
    assert_equal 2, response.parsed_body["log"]["totals"]["picked"]

    assert_no_difference -> { PlantHarvest.count } do
      post map_harvests_path(@map), params: { feature_ids: @apples.map(&:id), plant_harvest: { noted_on: "2026-10-12", stage: "picked", amount: "none" } }, as: :json
    end
    assert_response :unprocessable_entity

    post map_harvests_path(@map), params: { feature_ids: [ map_features(:pond).id ], plant_harvest: { noted_on: "2026-10-12", stage: "picked" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "a tree still to plant cannot be noted, alone or in a batch" do
    young = @map.features.create!(layer: "plants", kind: "plant", name: "Figuier", geometry: point, properties: { "species_id" => plant_species(:apple).id })
    sign_in_as users(:michael)
    post map_feature_plant_harvests_path(@map, young), params: { plant_harvest: { noted_on: Date.current.iso8601, stage: "picked" } }, as: :json
    assert_response :unprocessable_entity

    assert_no_difference -> { PlantHarvest.count } do
      post map_harvests_path(@map), params: { feature_ids: [ *@apples.map(&:id), young.id ], plant_harvest: { noted_on: Date.current.iso8601, stage: "picked" } }, as: :json
    end
    assert_response :unprocessable_entity
    assert_match "pas encore planté", response.body
  end

  test "the map's log, season by season" do
    @apples.first.plant_harvests.create!(noted_on: Date.new(2025, 9, 20), stage: "picked")
    sign_in_as users(:alice)
    get map_harvests_path(@map, season: 2025), as: :json
    assert_response :success
    body = response.parsed_body
    assert_equal 2025, body["season"]
    assert_equal [ 2025 ], body["followedSeasons"]
    assert_equal "picked", body["plants"].find { _1["featureId"] == @apples.first.id }["seasons"]["2025"]["status"]
  end

  test "a viewer reads but does not write, a stranger sees nothing" do
    sign_in_as users(:alice)
    get map_feature_plant_harvests_path(@map, @apples.first), as: :json
    assert_response :success
    post map_harvests_path(@map), params: { feature_ids: [ @apples.first.id ], plant_harvest: { noted_on: "2026-10-12", stage: "picked" } }, as: :json
    assert_response :forbidden

    sign_in_as users(:bob)
    get map_harvests_path(@map), as: :json
    assert_response :not_found
  end
end
