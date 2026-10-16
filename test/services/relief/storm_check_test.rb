require "test_helper"
require "test_helpers/synthetic_terrain_helper"

class Relief::StormCheckTest < ActiveSupport::TestCase
  include SyntheticTerrainHelper

  setup do
    # About 71 m east–west and 111 m north–south, relief with a 10 m margin.
    @map = Map.create!(name: "Vallon", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
    @centre = @map.boundary.centroid
  end

  test "water running down the valley floor follows the relief" do
    valley
    result = check(line([ 0, 30 ], [ 0, -30 ]))
    assert_equal "flows", result.water
    assert_equal "follows", result.verdict
    assert_operator result.share_on_axes, :>=, 0.9
    assert_in_delta 3.6, result.fall_m, 0.3
  end

  test "water running across the flank goes where the relief does not send it" do
    valley
    assert_equal "diverges", check(line([ 25, 30 ], [ 25, -30 ])).verdict
  end

  test "a line drawn uphill is said so" do
    valley
    assert_equal "uphill", check(line([ 0, -30 ], [ 0, 30 ])).verdict
  end

  test "standing water in a hollow, on a flat, or on a slope that should drain it" do
    synthetic_terrain(@map) { |dx, dy| 200 + (dx**2 + dy**2) * 0.002 }
    hollow = check(surface(0, 0))
    assert_equal "pools", hollow.water
    assert_equal "hollow", hollow.verdict
    assert_operator hollow.hollow_m, :>, 0.5

    synthetic_terrain(@map) { |_dx, _dy| 200 }
    assert_equal "flat", check(surface(0, 0)).verdict

    valley
    test_feature = @map.features.create!(layer: "water", kind: "infiltration_test",
      properties: { "method" => "ring", "readings" => [ 0, 1, 2, 3 ].map { |k| { "t_s" => k * 1800, "depth_cm" => 10 - k * 0.5 } } },
      geometry: point(20, 0))
    sloped = check(surface(20, 0))
    assert_equal "sloped", sloped.verdict
    assert_operator sloped.slope_pct, :>, 10
    assert_in_delta 10, sloped.infiltration_mm_h, 0.1
    assert_equal test_feature.reload.infiltration_rate_mm_h, sloped.infiltration_mm_h
    assert_equal 0, sloped.infiltration_distance_m
  end

  test "a seep tells how much ground drains to it" do
    valley
    result = check(point(0, -30))
    assert_equal "seeps", result.water
    assert_equal "seep", result.verdict
    assert_operator result.drained_m2, :>, 1000
  end

  test "only a storm observation, on a relief, can be read" do
    pond = @map.features.create!(layer: "water", kind: "pond", geometry: surface(0, 0))
    assert_equal :not_storm, assert_raises(Relief::StormCheck::Error) { Relief::StormCheck.new(@map, feature: pond).call }.key
    observation = storm(point(0, 0))
    assert_equal :no_relief, assert_raises(Relief::StormCheck::Error) { Relief::StormCheck.new(@map, feature: observation).call }.key
  end

  test "an observation takes its water from its shape and its time from when it was noted" do
    observation = storm(line([ 0, 30 ], [ 0, -30 ]), "water" => "seeps", "observed_at" => "hier")
    assert_equal "flows", observation.properties["water"]
    assert_in_delta Time.current, observation.observed_at, 5
    kept = storm(point(0, 0), "observed_at" => "2026-02-03T14:20:00Z")
    assert_equal Time.utc(2026, 2, 3, 14, 20), kept.observed_at
  end

  private
    # A valley running south: its floor falls 6 %, its flanks rise 15 %.
    def valley = synthetic_terrain(@map) { |dx, dy| 200 + dx.abs * 0.15 + dy * 0.06 }

    def check(geometry) = Relief::StormCheck.new(@map, feature: storm(geometry)).call

    def storm(geometry, properties = {})
      @map.features.create!(layer: "water", kind: "storm_observation", properties:, geometry:)
    end

    def at(dx, dy) = [ @centre.x + dx / 71_000.0, @centre.y + dy / 111_320.0 ]
    def point(dx, dy) = { "type" => "Point", "coordinates" => at(dx, dy) }
    def line(*points) = { "type" => "LineString", "coordinates" => points.map { |p| at(*p) } }

    def surface(dx, dy)
      ring = [ [ -3, -3 ], [ 3, -3 ], [ 3, 3 ], [ -3, 3 ], [ -3, -3 ] ].map { |x, y| at(dx + x, dy + y) }
      { "type" => "Polygon", "coordinates" => [ ring ] }
    end
end
