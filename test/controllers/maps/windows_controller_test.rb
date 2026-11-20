require "test_helper"
require_relative "../../test_helpers/relief_test_helper"
require "test_helpers/synthetic_terrain_helper"
require "test_helpers/soil_photos_helper"

class Maps::WindowsControllerTest < ActionDispatch::IntegrationTest
  include ReliefTestHelper
  include SyntheticTerrainHelper
  include SoilPhotosHelper

  setup do
    configure_relief_region
    @map = small_map
    @map.memberships.create!(user: users(:alice), role: "viewer")
  end

  test "without a relief, the window says to download it first" do
    sign_in_as users(:alice)
    get map_window_path(@map), headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "maps/windows/show", page["component"]
    assert_nil page.dig("props", "terrain")
    assert_equal [], page.dig("props", "photos")
  end

  test "with a relief: the grids, the design's plants, the located photos and where to open" do
    synthetic_terrain(@map) { |_dx, _dy| 200 }
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9001, lat: 50.3401),
                          properties: { "species_id" => plant_species(:apple).id })
    located = create_photo(map: @map, location: MapPhoto.point_from(4.9001, 50.3401), heading: 45, camera: { "focal_length_35mm" => 26 })
    create_photo(map: @map, salt: "elsewhere")
    sign_in_as users(:alice)

    get map_window_path(@map, photo_id: located.id, year: 99, lng: "x"), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_match %r{/maps/#{@map.id}/relief/files/grid\?v=}, props.dig("terrain", "files", "grid")
    assert_equal 1, props.dig("growingPlants", "plants").size
    photo = props["photos"].sole
    assert_equal [ located.id, 45.0, 26 ], photo.values_at("id", "heading", "focal35")
    assert_equal({ "photoId" => located.id, "point" => nil, "heading" => nil, "year" => 30 }, props["start"])
    refute props["canEdit"]

    get map_window_path(@map, lng: 4.9, lat: 50.34, heading: 370), headers: inertia_headers
    assert_equal({ "photoId" => nil, "point" => [ 4.9, 50.34 ], "heading" => 10.0, "year" => nil }, response.parsed_body.dig("props", "start"))
  end

  test "a stranger gets nothing" do
    sign_in_as users(:bob)
    get map_window_path(@map), headers: inertia_headers
    assert_response :not_found
  end
end
