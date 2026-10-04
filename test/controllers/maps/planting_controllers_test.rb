require "test_helper"

class Maps::PlantingControllersTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @patch = @map.features.create!(layer: "plants", kind: "patch", name: "Lisière", geometry: square(lng: 4.904, lat: 50.3395, size: 0.0002))
  end

  test "editor manages the palette and gets the planting state back" do
    sign_in_as users(:michael)
    post map_palette_items_path(@map), params: { palette_item: { species_id: plant_species(:apple).id, role: "food" } }, as: :json
    assert_response :created
    body = response.parsed_body
    assert_equal "Malus domestica", body["item"]["latinName"]
    assert_equal 1, body["planting"]["palette"].size
    item_id = body["item"]["id"]

    post map_palette_items_path(@map), params: { palette_item: { species_id: plant_species(:apple).id } }, as: :json
    assert_response :unprocessable_entity
    assert_match "déjà dans la palette", response.parsed_body["message"]

    patch map_palette_item_path(@map, item_id), params: { palette_item: { strata: "canopy", target_count: 4 } }, as: :json
    assert_response :success
    assert_equal "canopy", response.parsed_body["item"]["effectiveStrata"]
    assert_equal 4, response.parsed_body["item"]["targetCount"]

    delete map_palette_item_path(@map, item_id), as: :json
    assert_response :success
    assert_empty response.parsed_body["planting"]["palette"]
  end

  test "viewer reads the planting but cannot change it" do
    sign_in_as users(:alice)
    get map_planting_path(@map), as: :json
    assert_response :success
    assert response.parsed_body.key?("alerts")
    assert_equal PlantVocabulary::STRATA, response.parsed_body["strata"].keys

    post map_palette_items_path(@map), params: { palette_item: { species_id: plant_species(:apple).id } }, as: :json
    assert_response :forbidden
    post map_feature_patch_items_path(@map, @patch), params: { patch_item: { species_id: plant_species(:comfrey).id } }, as: :json
    assert_response :forbidden
  end

  test "strangers see nothing" do
    sign_in_as users(:bob)
    get map_planting_path(@map), as: :json
    assert_response :not_found
  end

  test "patch composition: density lines follow the PostGIS area" do
    sign_in_as users(:michael)
    post map_feature_patch_items_path(@map, @patch), params: { patch_item: { species_id: plant_species(:comfrey).id, density: 2 } }, as: :json
    assert_response :created
    patch_state = response.parsed_body["planting"]["patches"][@patch.id.to_s]
    area = patch_state["areaM2"]
    assert_in_delta 316, area, 20
    assert_equal (2 * area).round, patch_state["items"].first["quantity"]

    post map_feature_patch_items_path(@map, @patch), params: { patch_item: { species_id: plant_species(:strawberry).id, count: 12 } }, as: :json
    item = response.parsed_body["item"]
    assert_equal 12, response.parsed_body["planting"]["patches"][@patch.id.to_s]["items"].last["quantity"]

    patch map_feature_patch_item_path(@map, @patch, item["id"]), params: { patch_item: { count: 20 } }, as: :json
    assert_equal 20, response.parsed_body["item"]["count"]

    delete map_feature_patch_item_path(@map, @patch, item["id"]), as: :json
    assert_equal 1, response.parsed_body["planting"]["patches"][@patch.id.to_s]["items"].size
  end

  test "patch items only on patches" do
    sign_in_as users(:michael)
    post map_feature_patch_items_path(@map, map_features(:pond)), params: { patch_item: { species_id: plant_species(:comfrey).id } }, as: :json
    assert_response :not_found
  end

  test "palette suggestions" do
    regions(:wallonia).update!(settings: { "climate" => { "hardiness_zone" => 7 } })
    sign_in_as users(:alice)
    get suggestions_map_palette_items_path(@map), as: :json
    assert_response :success
    names = response.parsed_body["suggestions"].map { |s| s["latinName"] }
    assert_includes names, "Alnus glutinosa"
    assert_not_includes names, "Robinia pseudoacacia", "invasive in Belgium"
    assert_not_includes names, "Salvia rosmarinus", "not hardy in zone 7"
  end

  test "plant list as JSON, CSV and printable page" do
    sign_in_as users(:alice)
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906, lat: 50.341), properties: { "species_id" => plant_species(:apple).id })

    get map_plant_list_path(@map), as: :json
    assert_equal 1, response.parsed_body["total"]

    get map_plant_list_path(@map, format: :csv)
    assert_response :success
    assert_equal "text/csv", response.media_type
    assert_match "Malus domestica", response.body
    assert_match "Nom latin", response.body
    assert_match "liste-de-plants-domaine-d-ahinvaux.csv", response.headers["Content-Disposition"]

    get print_map_plant_list_path(@map), headers: inertia_headers
    assert_equal "maps/plant_lists/print", response.parsed_body["component"]
    assert_equal 1, response.parsed_body["props"]["list"]["total"]
  end

  test "observations of a planted plant, with a photo" do
    sign_in_as users(:michael)
    plant = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906, lat: 50.341),
                                  properties: { "species_id" => plant_species(:apple).id, "planted_on" => "2026-03-01" })
    photo = fixture_file_upload("plant.png", "image/png")
    post map_feature_plant_observations_path(@map, plant),
         params: { plant_observation: { observed_on: "2026-06-01", survival: "established", vigor: 4, note: "Belle reprise", photo: } }
    assert_response :created
    observation = response.parsed_body["observation"]
    assert_equal "established", observation["survival"]
    assert observation["photoUrl"].present?

    get map_feature_plant_observations_path(@map, plant), as: :json
    assert_equal 1, response.parsed_body["observations"].size

    stats = PlantObservation.stats_for(plant_species(:apple))
    assert_equal 1, stats[:plants]
    assert_equal 100, stats[:survivalRate]

    delete map_feature_plant_observation_path(@map, plant, observation["id"]), as: :json
    assert_empty response.parsed_body["observations"]
  end

  test "observation in the future is refused in French" do
    sign_in_as users(:michael)
    plant = @map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: {})
    post map_feature_plant_observations_path(@map, plant),
         params: { plant_observation: { observed_on: (Date.current + 3).iso8601, survival: "dead" } }, as: :json
    assert_response :unprocessable_entity
    assert_match "futur", response.parsed_body["message"]
  end
end
