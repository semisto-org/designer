require "test_helper"
require "test_helpers/synthetic_terrain_helper"

# The same cases as test/frontend/relief/grading.test.ts, on the server's side.
class Relief::GradingTest < ActiveSupport::TestCase
  include SyntheticTerrainHelper

  M_LAT = 1 / 111_320.0

  setup do
    # About 71 m east–west and 111 m north–south, on a slope of 10 % rising to the north.
    @map = Map.create!(name: "Coteau", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
    @centre = @map.boundary.centroid
    @m_lng = 1 / (111_320.0 * Math.cos(@centre.y * Math::PI / 180))
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
  end

  # A square of `size` metres centred on the boundary's centre.
  def plateau(size)
    h = size / 2.0
    corners = [ [ -h, -h ], [ h, -h ], [ h, h ], [ -h, h ], [ -h, -h ] ]
    { "type" => "Polygon", "coordinates" => [ corners.map { |dx, dy| [ @centre.x + dx * @m_lng, @centre.y + dy * M_LAT ] } ] }
  end

  def line(from_dx, to_dx, dy = 0)
    { "type" => "LineString", "coordinates" => [ from_dx, to_dx ].map { |dx| [ @centre.x + dx * @m_lng, @centre.y + dy * M_LAT ] } }
  end

  def graded(kind, geometry, properties)
    layer = "structures"
    @map.features.create!(layer:, kind:, geometry:, properties:)
  end

  test "a terrace hung in the middle balances its cut and its fill" do
    terrace = graded("graded_terrace", plateau(20), { "hinge" => "middle" })
    g = terrace.grading

    assert_in_delta 200, g["level_m"], 0.1
    assert_operator g["cut_m3"], :>, 100, "half the plateau is cut (20 m × ∫ 0.1 y over 10 m) plus its talus"
    assert_in_delta g["cut_m3"], g["fill_m3"], g["cut_m3"] * 0.1, "balanced, to a 1 m grid"
    assert_in_delta 1, g["max_cut_m"], 0.15
  end

  test "hung on its uphill edge, a terrace is all fill; at a given level, it sits there" do
    terrace = graded("graded_terrace", plateau(20), { "hinge" => "upper" })
    g = terrace.grading
    assert_in_delta 201, g["level_m"], 0.1
    assert_equal 0, g["cut_m3"], "a 10 % slope never rises above a 40 % talus"
    assert_operator g["fill_m3"], :>, 400

    terrace.update!(properties: terrace.properties.merge("hinge" => "level", "level_m" => 199))
    g = terrace.reload.grading
    assert_equal 199.0, g["level_m"]
    assert_operator g["cut_m3"], :>, 400
    assert_equal 0, g["fill_m3"]
  end

  test "a bench along the contour cuts uphill and fills downhill; a bank is all fill" do
    bench = graded("graded_profile", line(-20, 20), { "shape" => "bench", "width_m" => 4, "level_mode" => "follow" })
    g = bench.grading
    assert_in_delta g["cut_m3"], g["fill_m3"], g["cut_m3"] * 0.3, "balanced, to a 1 m grid"
    assert_operator g["cut_m3"], :>, 5
    assert_in_delta 200, bench.grading.fetch("level_m", 200), 0.1

    bank = graded("graded_profile", line(-20, 20), { "shape" => "bank", "width_m" => 2, "height_m" => 1 })
    g = bank.grading
    assert_equal 0, g["cut_m3"]
    assert_in_delta 40 * 2 + 40 * 2.5 + 25, g["fill_m3"], 30, "crest 2 m × 1 m, two talus of ½ × 2.5 × 1 (40 %), on 40 m, its ends and a longer foot downhill"
    assert_in_delta 1, g["max_fill_m"], 0.15
  end

  test "a bench falling at a grade starts from the ground at its first point" do
    ramp = graded("graded_profile", line(0, 0, -20).tap { |l| l["coordinates"][1][1] = @centre.y + 20 * M_LAT },
      { "shape" => "bench", "width_m" => 3, "level_mode" => "grade", "grade_pct" => -5 })
    # From 198 m at its southern end, rising 5 % over 40 m to 200 m, while the ground rises to 202 m: cut at the top.
    assert_in_delta 198, ramp.grading["level_m"], 0.1
    assert_operator ramp.grading["cut_m3"], :>, ramp.grading["fill_m3"]
  end

  test "the uphill and downhill talus are set apart, in %, and the older slope_ratio still counts" do
    steep = graded("graded_terrace", plateau(20), { "hinge" => "middle", "cut_slope_pct" => 40, "fill_slope_pct" => 100 }).grading
    gentle = graded("graded_terrace", plateau(20), { "hinge" => "middle", "cut_slope_pct" => 40, "fill_slope_pct" => 30 }).grading
    assert_in_delta steep["cut_m3"], gentle["cut_m3"], 0.5, "the cut side does not change"
    assert_operator gentle["fill_m3"], :>, steep["fill_m3"] + 5

    # An element saved before the gradients (no defaults applied on update).
    legacy = graded("graded_terrace", plateau(20), {})
    legacy.update!(properties: { "hinge" => "middle", "slope_ratio" => 1 })
    both = graded("graded_terrace", plateau(20), { "hinge" => "middle", "cut_slope_pct" => 100, "fill_slope_pct" => 100 }).grading
    assert_in_delta both["fill_m3"], legacy.grading["fill_m3"], 0.5, "slope_ratio 1 = 100 %"
  end

  test "a patio on a slope is levelled in the middle, like a graded terrace" do
    patio = graded("terrace", plateau(10), { "surface" => "wood" })
    g = patio.grading
    assert_in_delta 200, g["level_m"], 0.1
    assert_in_delta g["cut_m3"], g["fill_m3"], g["cut_m3"] * 0.25, "balanced, to a 1 m grid"
    assert_in_delta 0.5, g["max_cut_m"], 0.15, "10 m on a 10 % slope: half a metre each side"
  end

  test "the volumes are the server's: a client value is replaced, and without relief there is none" do
    terrace = graded("graded_terrace", plateau(10), { "grading" => { "cut_m3" => 9999 } })
    assert_not_equal 9999, terrace.grading["cut_m3"]

    other = Map.create!(name: "Sans relief", owner: users(:michael), region: regions(:wallonia))
    flat = other.features.create!(layer: "structures", kind: "graded_terrace", geometry: square(size: 0.0002), properties: { "grading" => { "cut_m3" => 1 } })
    assert_nil flat.grading
  end

  test "a relief imported later gives the volumes to the terraces already drawn" do
    other = Map.create!(name: "Plus tard", owner: users(:michael), region: regions(:wallonia))
    other.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
    terrace = other.features.create!(layer: "structures", kind: "graded_terrace", geometry: plateau(20), properties: { "hinge" => "upper" })
    assert_nil terrace.grading

    synthetic_terrain(other) { |_dx, dy| 200 + dy * 0.1 }
    MapFeature.regrade_map(other)
    assert_in_delta 201, terrace.reload.grading["level_m"], 0.1
  end
end
