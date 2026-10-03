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
end
