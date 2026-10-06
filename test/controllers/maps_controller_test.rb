require "test_helper"

class MapsControllerTest < ActionDispatch::IntegrationTest
  test "requires sign in" do
    get maps_path
    assert_redirected_to new_session_path
  end

  test "lists my maps" do
    sign_in_as users(:michael)
    get maps_path, headers: inertia_headers
    assert_response :success
    assert_equal "maps/index", JSON.parse(response.body)["component"]
  end

  test "creates a map" do
    sign_in_as users(:bob)
    assert_difference -> { Map.count } do
      post maps_path, params: { map: { name: "Jardin" } }
    end
    assert_equal users(:bob), Map.last.owner
  end

  test "creates a map in the region of its place" do
    load Rails.root.join("db/seeds/01_regions.rb").to_s
    sign_in_as users(:bob)
    post maps_path, params: { map: { name: "Jardin lillois", center: [ 3.06, 50.63 ] } }
    assert_equal "france", Map.last.region.key
  end

  test "the new map form opens on the European base" do
    load Rails.root.join("db/seeds/01_regions.rb").to_s
    load Rails.root.join("db/seeds/03_europe_layers.rb").to_s
    sign_in_as users(:bob)
    get new_map_path, headers: inertia_headers
    props = JSON.parse(response.body)["props"]
    assert_equal "europe", props.dig("region", "key")
    assert_equal [ "plan" ], props["layers"].map { _1["key"] }
  end

  test "the editor says whether Claude is plugged in (end of the carnet de route)" do
    user = users(:michael)
    sign_in_as user
    get map_path(maps(:ahinvaux)), headers: inertia_headers
    assert_equal false, response.parsed_body.dig("props", "aiConnected")

    ApiToken.create!(user:, name: "Claude Code", access: "read")
    get map_path(maps(:ahinvaux)), headers: inertia_headers
    assert_equal true, response.parsed_body.dig("props", "aiConnected")
  end

  test "hides maps of others" do
    sign_in_as users(:bob)
    get map_path(maps(:ahinvaux))
    assert_response :not_found
  end

  test "features API: viewer reads, cannot write" do
    sign_in_as users(:alice)
    get map_features_path(maps(:ahinvaux)), as: :json
    assert_response :success
    assert_equal 1, response.parsed_body["features"].size
    post map_features_path(maps(:ahinvaux)), params: { feature: { layer: "water", kind: "pond", geometry: square } }, as: :json
    assert_response :forbidden
  end

  test "features API: owner creates, updates with optimistic locking, deletes" do
    sign_in_as users(:michael)
    map = maps(:ahinvaux)
    post map_features_path(map), params: { feature: { layer: "plants", kind: "tree", name: "Noyer", geometry: point } }, as: :json
    assert_response :created
    id = response.parsed_body["id"]
    patch map_feature_path(map, id), params: { feature: { name: "Noyer royal", lock_version: 0 } }, as: :json
    assert_response :success
    patch map_feature_path(map, id), params: { feature: { name: "Conflit", lock_version: 0 } }, as: :json
    assert_response :conflict
    delete map_feature_path(map, id), as: :json
    assert_response :no_content
  end

  test "features API: tags are set, normalized and cleared" do
    sign_in_as users(:michael)
    map = maps(:ahinvaux)
    feature = map.features.create!(layer: "networks", kind: "water_pipe", geometry: { "type" => "LineString", "coordinates" => [ [ 4.9, 50.34 ], [ 4.91, 50.34 ] ] })
    patch map_feature_path(map, feature), params: { feature: { tags: [ " Phase  1", "phase 1", "Zone nord" ], lock_version: 0 } }, as: :json
    assert_response :success
    assert_equal [ "Phase 1", "Zone nord" ], response.parsed_body["properties"]["tags"]
    patch map_feature_path(map, feature), params: { feature: { tags: [], lock_version: 1 } }, as: :json
    assert_response :success
    assert_equal [], feature.reload.tags
    patch map_feature_path(map, feature), params: { feature: { tags: (1..21).map(&:to_s), lock_version: 2 } }, as: :json
    assert_response :unprocessable_entity
  end

  test "saves a drawn boundary sent as JSON (the editor's « Dessiner le contour »)" do
    sign_in_as users(:michael)
    map = maps(:ahinvaux)
    multi = { "type" => "MultiPolygon", "coordinates" => [ square["coordinates"] ] }
    patch map_path(map), params: { map: { boundary: multi } }, as: :json
    assert_response :success
    assert_equal "MultiPolygon", response.parsed_body.dig("map", "boundary", "type")
    assert map.reload.boundary.present?
  end
end
