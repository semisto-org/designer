require "test_helper"
require_relative "../../test_helpers/drone_test_helper"

# The map editor receives the map's drone views with its props: everyone who
# can open the map sees them, viewers included.
class Maps::AerialViewsPropsTest < ActionDispatch::IntegrationTest
  include DroneTestHelper

  setup do
    @map = maps(:ahinvaux)
    @older = aerial_view(@map, captured_on: Date.new(2026, 9, 3), kind: "xyz", url: XYZ_URL, max_zoom: 21)
    @newer = aerial_view(@map, captured_on: Date.new(2027, 5, 12))
  end

  def aerial_views = response.parsed_body.dig("props", "aerialViews")

  test "a viewer gets the views, newest first, ready for the base-map choice" do
    sign_in_as users(:alice)
    get map_path(@map), headers: inertia_headers
    assert_response :success
    assert_equal [ @newer.id, @older.id ], aerial_views.map { _1["id"] }
    assert_equal({ "id" => @older.id, "name" => "Vue drone", "capturedOn" => "2026-09-03", "kind" => "xyz", "url" => XYZ_URL,
                   "attribution" => nil, "minZoom" => nil, "maxZoom" => 21 }, aerial_views.last)
  end

  test "the owner gets them too; a map without views gets an empty list" do
    sign_in_as users(:michael)
    get map_path(@map), headers: inertia_headers
    assert_equal 2, aerial_views.size

    other = users(:michael).owned_maps.create!(name: "Potager", region: regions(:wallonia))
    get map_path(other), headers: inertia_headers
    assert_equal [], aerial_views
  end

  test "people the map is not shared with get nothing" do
    sign_in_as users(:bob)
    get map_path(@map), headers: inertia_headers
    assert_response :not_found
  end
end
