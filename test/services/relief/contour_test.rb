require "test_helper"
require "test_helpers/synthetic_terrain_helper"

class Relief::ContourTest < ActiveSupport::TestCase
  include SyntheticTerrainHelper

  setup do
    # About 71 m east–west and 111 m north–south.
    @map = Map.create!(name: "Coteau", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
    @centre = @map.boundary.centroid
  end

  test "on a slope rising to the north, the contour runs east–west across the whole terrain" do
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    result = Relief::Contour.new(@map, lng: @centre.x, lat: @centre.y).call

    assert_equal "LineString", result.geometry["type"]
    assert_in_delta 200, result.elevation_m, 0.05
    refute result.closed
    lngs = result.geometry["coordinates"].map(&:first)
    assert_in_delta 4.9, lngs.min, 0.00002, "reaches the western edge of the boundary"
    assert_in_delta 4.901, lngs.max, 0.00002, "reaches the eastern edge"
    result.geometry["coordinates"].each { |_, lat| assert_in_delta @centre.y, lat, 0.000005 }
    assert_in_delta 71, result.length_m, 1.5
    assert_operator result.geometry["coordinates"].size, :<, 10, "a straight contour is simplified to a few points"
  end

  test "around a hill, the contour is a closed ring at the same distance from the top" do
    synthetic_terrain(@map) { |dx, dy| 210 - Math.hypot(dx, dy) * 0.2 }
    lat = @centre.y + 15 / 111_320.0
    result = Relief::Contour.new(@map, lng: @centre.x, lat:).call

    assert result.closed
    assert_in_delta 207, result.elevation_m, 0.1
    assert_in_delta 2 * Math::PI * 15, result.length_m, 3
    result.geometry["coordinates"].each do |lng, la|
      distance = Math.hypot((lng - @centre.x) * 111_320 * Math.cos(50.3405 * Math::PI / 180), (la - @centre.y) * 111_320)
      assert_in_delta 15, distance, 0.6
    end
  end

  test "noise in the heights does not make the line zigzag" do
    synthetic_terrain(@map) { |dx, dy| 200 + dy * 0.1 + ((dx.round + dy.round).even? ? 0.03 : -0.03) }
    result = Relief::Contour.new(@map, lng: @centre.x, lat: @centre.y).call
    result.geometry["coordinates"].each { |_, lat| assert_in_delta @centre.y, lat, 0.00001 }
  end

  test "explains why no line can be traced" do
    error = assert_raises(Relief::Contour::Error) { Relief::Contour.new(@map, lng: @centre.x, lat: @centre.y).call }
    assert_equal :no_relief, error.key
    assert_match(/Eau et relief/, error.message)

    synthetic_terrain(@map) { |_dx, _dy| 200 }
    assert_equal :flat, assert_raises(Relief::Contour::Error) { Relief::Contour.new(@map, lng: @centre.x, lat: @centre.y).call }.key
    assert_equal :outside_boundary, assert_raises(Relief::Contour::Error) { Relief::Contour.new(@map, lng: 4.95, lat: 50.34).call }.key
  end
end
