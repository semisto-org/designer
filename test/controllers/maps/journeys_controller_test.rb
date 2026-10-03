require "test_helper"

class Maps::JourneysControllerTest < ActionDispatch::IntegrationTest
  setup { @map = maps(:ahinvaux) }

  test "members read the journey of the map" do
    sign_in_as users(:alice)
    get map_journey_path(@map), as: :json
    assert_response :success
    body = response.parsed_body
    assert_equal "design", body["stage"]
    assert_equal 4, body["steps"].size
    assert_equal "boundary", body["steps"].find { _1["key"] == "map" }["items"].first["key"]
    assert body["steps"].find { _1["key"] == "map" }["items"].first["done"], "the fixture map has an outline"
  end

  test "the seen flags of the browser are taken into account" do
    sign_in_as users(:michael)
    get map_journey_path(@map, seen: "layers_seen"), as: :json
    layers = response.parsed_body["steps"].first["items"].find { _1["key"] == "layers_seen" }
    assert layers["done"]
    assert layers["client"]
  end

  test "strangers get a 404" do
    sign_in_as users(:bob)
    get map_journey_path(@map), as: :json
    assert_response :not_found
  end

  test "the stage can be marked by editors through the map update" do
    sign_in_as users(:michael)
    patch map_path(@map), params: { map: { stage: "plant" } }, as: :json
    assert_response :success
    assert_equal "plant", @map.reload.stage
    sign_in_as users(:alice)
    patch map_path(@map), params: { map: { stage: "observe" } }, as: :json
    assert_response :forbidden
  end
end
