require "test_helper"
require "test_helpers/synthetic_terrain_helper"

class Relief::KeypointsTest < ActiveSupport::TestCase
  include SyntheticTerrainHelper

  setup do
    # About 71 m east–west and 111 m north–south, relief with a 10 m margin.
    @map = Map.create!(name: "Vallon", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
    @centre = @map.boundary.centroid
  end

  test "the keypoint of a valley is where its floor stops falling steeply" do
    # A valley running south: its floor falls 10 % north of the centre, 2 % south of it.
    synthetic_terrain(@map) { |dx, dy| 200 + dx.abs * 0.15 + (dy.positive? ? dy * 0.10 : dy * 0.02) }
    result = Relief::Keypoints.new(@map).call

    assert_equal 1, result.keypoints.size
    point = result.keypoints.first
    assert_in_delta @centre.y, point.lat, 3 / 111_320.0
    assert_in_delta @centre.x, point.lng, 2 / 71_000.0
    assert_in_delta 10, point.slope_above_pct, 1
    assert_in_delta 2, point.slope_below_pct, 1
    assert_operator point.catchment_m2, :>, 3000
    assert_equal "LineString", point.valley["type"]

    keyline = point.keyline
    assert keyline, "a keyline goes through the keypoint"
    assert_in_delta 200, keyline.elevation_m, 0.3
    # The keypoint is the apex of its contour: on the flanks, the same height
    # lies farther down the valley.
    lats = keyline.geometry["coordinates"].map(&:last)
    assert_in_delta @centre.y, lats.max, 3 / 111_320.0
    assert_operator lats.min, :<, @centre.y - 20 / 111_320.0
  end

  test "a valley of even slope has no keypoint" do
    synthetic_terrain(@map) { |dx, dy| 200 + dx.abs * 0.15 + dy * 0.06 }
    assert_empty Relief::Keypoints.new(@map).call.keypoints
  end

  test "a terrain without relief cannot be read" do
    error = assert_raises(Relief::Keypoints::Error) { Relief::Keypoints.new(@map).call }
    assert_equal :no_relief, error.key
  end
end
