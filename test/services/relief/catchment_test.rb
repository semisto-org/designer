require "test_helper"
require "test_helpers/synthetic_terrain_helper"

class Relief::CatchmentTest < ActiveSupport::TestCase
  include SyntheticTerrainHelper

  setup do
    # About 71 m east–west and 111 m north–south, relief with a 10 m margin.
    @map = Map.create!(name: "Vallon", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001), water_settings: { "annual_rainfall_mm" => 800 })
    @centre = @map.boundary.centroid
  end

  test "a pond in a valley gathers the valley upstream, which goes on beyond the relief" do
    # A valley running south, its floor on the north–south axis.
    synthetic_terrain(@map) { |dx, dy| 200 + dx.abs * 0.1 + dy * 0.05 }
    pond = pond_at(0, 0, size_m: 6, depth_m: 1.5)
    result = Relief::Catchment.new(@map, feature: pond).call

    assert result.beyond_relief, "the valley comes from beyond the downloaded relief"
    # The grid above the pond (~91 m wide, ~65 m to the north edge), less the
    # flanks whose water reaches the valley floor below the pond (water crosses
    # 45 m of flank while falling 22 m south).
    assert_in_delta 91 * 65.5 - 2 * 0.5 * 45.5 * 22.75, result.area_m2, 400
    assert_operator result.inside_boundary_m2, :<, result.area_m2
    assert_equal 27.0, result.capacity_m3
    assert_equal (27.0 / result.area_m2 * 1000).round, result.fill_rain_mm
    assert_equal (result.area_m2 * 0.8).round, result.annual_rain_m3
    assert_includes %w[Polygon MultiPolygon], result.geometry["type"]
    lats = result.geometry["coordinates"].flatten.each_slice(2).map(&:last)
    assert_operator lats.min, :>, @centre.y - 4 / 111_320.0, "nothing south of the pond drains into it"
  end

  test "a pond at the bottom of a hollow gathers the whole hollow, and only it" do
    # A bowl 60 m across, its rim a ridge the ground falls away from.
    synthetic_terrain(@map) do |dx, dy|
      r = Math.hypot(dx, dy)
      r < 30 ? 199 + r**2 / 900.0 * 3 : 202.5 - (r - 30) * 0.05
    end
    pond = pond_at(0, 0, size_m: 4, depth_m: 1)
    result = Relief::Catchment.new(@map, feature: pond).call

    refute result.beyond_relief
    assert_in_delta Math::PI * 30**2, result.area_m2, 400
  end

  test "a swale on the contour gathers the slope above it" do
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    line = [ [ 4.9 + 0.0001, @centre.y ], [ 4.901 - 0.0001, @centre.y ] ]
    swale = @map.features.create!(layer: "water", kind: "swale", geometry: line_string(line), properties: { "width_m" => 1, "depth_m" => 0.4 })
    result = Relief::Catchment.new(@map, feature: swale).call

    # 57 m of swale, about 66 m of slope above it (boundary half + margin).
    assert_in_delta 57 * 66, result.area_m2, 450
    assert result.beyond_relief
    assert_in_delta 57 * 1 * 0.4 * 0.5, result.capacity_m3, 0.6
  end

  test "a swale empties at the rate of the nearest infiltration test" do
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    line = [ [ 4.9 + 0.0001, @centre.y ], [ 4.901 - 0.0001, @centre.y ] ]
    swale = @map.features.create!(layer: "water", kind: "swale", geometry: line_string(line), properties: { "width_m" => 1, "depth_m" => 0.4 })
    assert_nil Relief::Catchment.new(@map, feature: swale).call.empties_in_h

    readings = [ 0, 10, 20, 30 ].each_with_index.map { |m, i| { "t_s" => m * 60, "depth_cm" => 10 - i * 0.4 } }
    @map.features.create!(layer: "water", kind: "infiltration_test", geometry: { "type" => "Point", "coordinates" => [ 4.9005, @centre.y + 10 / 111_320.0 ] },
                          properties: { "method" => "ring", "readings" => readings })
    result = Relief::Catchment.new(@map, feature: swale).call

    assert_equal 24.0, result.infiltration_mm_h
    assert_in_delta 10, result.infiltration_distance_m, 1
    assert_in_delta 400 / 24.0, result.empties_in_h, 0.1

    # A keyline dug as a swale empties the same; planted with trees, it holds nothing.
    keyline = @map.features.create!(layer: "water", kind: "keyline", geometry: line_string(line), properties: { "use" => "swale", "width_m" => 1, "depth_m" => 0.4 })
    assert_in_delta 400 / 24.0, Relief::Catchment.new(@map, feature: keyline).call.empties_in_h, 0.1
    keyline.update!(properties: keyline.properties.merge("use" => "trees"))
    trees = Relief::Catchment.new(@map, feature: keyline).call
    assert_nil trees.empties_in_h
    assert_nil trees.capacity_m3
    assert_operator trees.area_m2, :>, 0
  end

  test "a check dam across a valley gathers the valley above it and holds no volume of its own" do
    synthetic_terrain(@map) { |dx, dy| 200 + dx.abs * 0.1 + dy * 0.05 }
    line = [ [ @centre.x - 8 / 71_000.0, @centre.y ], [ @centre.x + 8 / 71_000.0, @centre.y ] ]
    dam = @map.features.create!(layer: "water", kind: "check_dam", geometry: line_string(line), properties: { "height_m" => 0.4 })
    result = Relief::Catchment.new(@map, feature: dam).call

    assert_operator result.area_m2, :>, 3000
    assert_nil result.capacity_m3
    assert_nil result.empties_in_h
  end

  test "half-moons hold half a bowl each, one per point or one every spacing along a line" do
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    moon = @map.features.create!(layer: "water", kind: "half_moon", geometry: { "type" => "Point", "coordinates" => [ @centre.x, @centre.y ] },
                                 properties: { "diameter_m" => 3, "depth_m" => 0.2 })
    one = Math::PI * 1.5**2 / 2 * 0.2 * 0.5
    assert_in_delta one, moon.water_capacity_m3, 1e-6
    assert_in_delta one, Relief::Catchment.new(@map, feature: moon).call.capacity_m3, 0.1

    row = @map.features.create!(layer: "water", kind: "half_moon", geometry: line_string([ [ @centre.x - 10 / 71_000.0, @centre.y ], [ @centre.x + 10 / 71_000.0, @centre.y ] ]),
                                properties: { "diameter_m" => 3, "depth_m" => 0.2, "spacing_m" => 5 })
    # 20 m: at 0, 5, 10, 15 and 20 m.
    assert_equal 5, row.half_moon_count
    assert_in_delta 5 * one, row.water_capacity_m3, 1e-6
  end

  test "a point on a summit drains only itself" do
    synthetic_terrain(@map) { |dx, dy| 210 - Math.hypot(dx, dy) * 0.2 }
    result = Relief::Catchment.new(@map, lng: @centre.x, lat: @centre.y).call

    refute result.beyond_relief
    assert_operator result.area_m2, :<, 10
    assert_nil result.capacity_m3
    assert_nil result.fill_rain_mm
  end

  test "explains why there is no catchment" do
    pond = pond_at(0, 0, size_m: 4, depth_m: 1)
    assert_equal :no_relief, assert_raises(Relief::Catchment::Error) { Relief::Catchment.new(@map, feature: pond).call }.key

    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    path = @map.features.create!(layer: "access", kind: "path", geometry: line_string([ [ 4.9002, 50.3402 ], [ 4.9004, 50.3404 ] ]))
    error = assert_raises(Relief::Catchment::Error) { Relief::Catchment.new(@map, feature: path).call }
    assert_equal :not_water, error.key
    assert_equal :outside_relief, assert_raises(Relief::Catchment::Error) { Relief::Catchment.new(@map, lng: 4.95, lat: 50.34).call }.key
  end

  private
    def pond_at(dx, dy, size_m:, depth_m:)
      half_lng = size_m / 2.0 / (111_320 * Math.cos(@centre.y * Math::PI / 180))
      half_lat = size_m / 2.0 / 111_320
      lng = @centre.x + dx / (111_320 * Math.cos(@centre.y * Math::PI / 180))
      lat = @centre.y + dy / 111_320.0
      ring = [ [ lng - half_lng, lat - half_lat ], [ lng + half_lng, lat - half_lat ], [ lng + half_lng, lat + half_lat ], [ lng - half_lng, lat + half_lat ], [ lng - half_lng, lat - half_lat ] ]
      @map.features.create!(layer: "water", kind: "pond", geometry: { "type" => "Polygon", "coordinates" => [ ring ] }, properties: { "depth_m" => depth_m })
    end

    def line_string(coordinates) = { "type" => "LineString", "coordinates" => coordinates }
end
