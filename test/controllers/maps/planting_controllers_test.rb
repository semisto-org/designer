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

  test "palette drafts proposed by an AI are accepted or refused" do
    apple = PaletteItem.create!(map: @map, species: plant_species(:apple), status: "draft", source: "ai", rationale: "Ligne 2 du tableur.")
    comfrey = PaletteItem.create!(map: @map, species: plant_species(:comfrey), status: "draft", source: "ai", rationale: "Ligne 3 du tableur.")
    alder = PaletteItem.create!(map: @map, species: plant_species(:alder), status: "draft", source: "ai", rationale: "Ligne 4 du tableur.")

    sign_in_as users(:alice)
    post accept_map_palette_item_path(@map, apple), as: :json
    assert_response :forbidden

    sign_in_as users(:michael)
    get map_planting_path(@map), as: :json
    assert_empty response.parsed_body["palette"]
    assert_equal 3, response.parsed_body["paletteDrafts"].size

    post accept_map_palette_item_path(@map, apple), as: :json
    assert_response :success
    assert_equal [ apple.id ], response.parsed_body["planting"]["palette"].map { |i| i["id"] }
    post reject_map_palette_item_path(@map, comfrey), as: :json
    refute PaletteItem.exists?(comfrey.id)

    # Adding by hand a species Claude proposed accepts its draft.
    post map_palette_items_path(@map), params: { palette_item: { species_id: plant_species(:alder).id } }, as: :json
    assert_response :created
    assert_equal "active", alder.reload.status
    assert_empty response.parsed_body["planting"]["paletteDrafts"]

    PaletteItem.create!(map: @map.reload, species: plant_species(:rosemary), status: "draft", source: "ai")
    PaletteItem.create!(map: @map.reload, species: plant_species(:strawberry), status: "draft", source: "ai")
    post accept_map_palette_item_path(@map, "all"), as: :json
    assert_response :success
    assert_equal 4, @map.palette_items.count
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

  test "plant list filtered by tag, grouped by tag, and its CSV" do
    sign_in_as users(:alice)
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906, lat: 50.341), tags: [ "Verger" ],
                          properties: { "species_id" => plant_species(:apple).id })
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.907, lat: 50.341),
                          properties: { "species_id" => plant_species(:alder).id })

    get map_plant_list_path(@map, tag: "verger"), as: :json
    assert_equal [ "Malus domestica" ], response.parsed_body["rows"].map { |r| r["latinName"] }
    get map_plant_list_path(@map, untagged: "1"), as: :json
    assert_equal 1, response.parsed_body["total"]

    get map_plant_list_path(@map, group: "tag"), as: :json
    body = response.parsed_body
    assert_equal [ "Verger" ], body["groups"].map { |g| g["tag"] }
    assert_equal 1, body["groups"].sole["list"]["total"]
    assert_equal 1, body["untagged"]["total"]

    get map_plant_list_path(@map, format: :csv, tag: "Verger")
    assert_match "liste-de-plants-domaine-d-ahinvaux-verger.csv", response.headers["Content-Disposition"]
    assert_no_match "Alnus", response.body
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
    assert_no_match %r{/rails/active_storage/blobs/}, observation["photoUrl"], "never a public link to the original"

    # Viewers see the photo through a short-lived link to a stripped variant.
    sign_in_as users(:alice)
    get observation["thumbUrl"]
    assert_response :redirect
    assert_match(/private/, response.headers["Cache-Control"])
    encoded = response.location[%r{/disk/([^/]+)/}, 1]
    served = ActiveStorage.verifier.verified(encoded, purpose: :blob_key)
    assert_not_equal PlantObservation.find(observation["id"]).photo.blob.key, served[:key] || served["key"]
    sign_in_as users(:bob)
    get observation["thumbUrl"]
    assert_response :not_found
    sign_in_as users(:michael)

    get map_feature_plant_observations_path(@map, plant), as: :json
    assert_equal 1, response.parsed_body["observations"].size

    stats = PlantObservation.stats_for(plant_species(:apple))
    assert_equal 1, stats[:plants]
    assert_equal 100, stats[:survivalRate]

    delete map_feature_plant_observation_path(@map, plant, observation["id"]), as: :json
    assert_empty response.parsed_body["observations"]
  end

  test "an observation photo in HEIC is stored as a JPEG" do
    sign_in_as users(:michael)
    plant = @map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: { "species_id" => plant_species(:apple).id })
    post map_feature_plant_observations_path(@map, plant),
         params: { plant_observation: { observed_on: "2026-06-01", survival: "established", photo: fixture_file_upload("terrain_gps.heic", "image/heic") } }
    assert_response :created
    blob = PlantObservation.find(response.parsed_body["observation"]["id"]).photo.blob
    assert_equal [ "image/jpeg", "terrain_gps.jpg" ], [ blob.content_type, blob.filename.to_s ]
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
