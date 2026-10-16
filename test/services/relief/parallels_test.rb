require "test_helper"
require "test_helpers/synthetic_terrain_helper"

class Relief::ParallelsTest < ActiveSupport::TestCase
  include SyntheticTerrainHelper

  setup do
    # About 71 m east–west and 111 m north–south; the ground rises northwards.
    @map = Map.create!(name: "Coteau", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
    @centre = @map.boundary.centroid
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
  end

  test "parallels every spacing above and below, upslope first, clipped to the boundary" do
    # Drawn west → east and east → west: the upslope side is read on the terrain.
    [ [ 4.8999, 4.9011 ], [ 4.9011, 4.8999 ] ].each do |from, to|
      keyline = keyline_from(from, to)
      lines = Relief::Parallels.new(@map, feature: keyline, spacing_m: 10, above: 2, below: 1).call

      assert_equal [ [ "above", 1 ], [ "above", 2 ], [ "below", 1 ] ], lines.map { |l| [ l.side, l.rank ] }
      offsets = lines.map { |l| (l.geometry["coordinates"].map(&:last).sum / l.geometry["coordinates"].size - @centre.y) * 111_320 }
      [ 10, 20, -10 ].zip(offsets).each { |expected, actual| assert_in_delta expected, actual, 0.6 }
      lines.each do |line|
        assert_in_delta 71, line.length_m, 2, "clipped to the boundary"
        assert_in_delta 0, line.fall_m, 0.1, "on an even slope the parallels are contours too"
      end
    end
  end

  test "only from a keyline, on a slope, with a sensible spacing" do
    keyline = keyline_from(4.8999, 4.9011)
    assert_equal :spacing, assert_raises(Relief::Parallels::Error) { Relief::Parallels.new(@map, feature: keyline, spacing_m: 0, above: 1, below: 1).call }.key

    swale = @map.features.create!(layer: "water", kind: "swale", geometry: keyline.geometry_geojson)
    assert_equal :not_keyline, assert_raises(Relief::Parallels::Error) { Relief::Parallels.new(@map, feature: swale, spacing_m: 10, above: 1, below: 1).call }.key

    synthetic_terrain(@map) { |_dx, _dy| 200 }
    assert_equal :flat, assert_raises(Relief::Parallels::Error) { Relief::Parallels.new(@map, feature: keyline, spacing_m: 10, above: 1, below: 1).call }.key
  end

  private
    def keyline_from(from, to)
      @map.features.create!(layer: "water", kind: "keyline", properties: { "role" => "keyline", "use" => "swale" },
                            geometry: { "type" => "LineString", "coordinates" => [ [ from, @centre.y ], [ to, @centre.y ] ] })
    end
end
