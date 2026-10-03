require "test_helper"
require_relative "../../support/map_data_test_helper"

# "Nouvelle carte": address result → map centered there → editor opens on
# the chosen terrain step.
class Maps::NewMapFlowTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper

  test "the form gets the region's base maps for its preview" do
    seed_wallonia_layers
    sign_in_as users(:bob)
    get new_map_path, headers: inertia_headers
    props = JSON.parse(response.body)["props"]
    assert_equal %w[plan ortho_2026 ortho_1994 ortho_1971], props["layers"].pluck("key")
  end

  test "creates the map at the chosen address and opens the parcel picker" do
    sign_in_as users(:bob)
    post maps_path, params: { map: { name: "Jardin", address: "Rue du Bois 3, 5530 Yvoir", center: [ 4.8801, 50.3289 ], zoom: 18 }, next: "parcels" }, as: :json
    map = Map.last
    assert_redirected_to map_path(map, terrain: "parcels")
    assert_equal "Rue du Bois 3, 5530 Yvoir", map.address
    assert_in_delta 4.8801, map.center.x, 1e-6
    assert_equal 18, map.zoom
  end

  test "unknown next steps are ignored" do
    sign_in_as users(:bob)
    post maps_path, params: { map: { name: "Jardin" }, next: "javascript:alert(1)" }
    assert_redirected_to map_path(Map.last)
  end
end
