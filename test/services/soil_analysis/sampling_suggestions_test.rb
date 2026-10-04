require "test_helper"

class SoilAnalysis::SamplingSuggestionsTest < ActiveSupport::TestCase
  F = GeoJsonGeometry::FACTORY
  LNG = 4.9
  LAT = 50.34
  M_LNG = 1 / (111_320.0 * Math.cos(LAT * Math::PI / 180)) # degrees per meter, east
  M_LAT = 1 / 110_540.0

  # Meters east/north of the south-west corner of a 100 x 100 m terrain.
  def at(x, y) = F.point(LNG + x * M_LNG, LAT + y * M_LAT)

  def rectangle(x0, y0, x1, y1)
    F.polygon(F.linear_ring([ at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0) ]))
  end

  def terrain(size = 100) = F.multi_polygon([ rectangle(0, 0, size, size) ])

  # Position of a suggested point in meters from the south-west corner.
  def meters(point) = [ ((point.lng - LNG) / M_LNG).round(1), ((point.lat - LAT) / M_LAT).round(1) ]

  def suggest(**options) = SoilAnalysis::SamplingSuggestions.new(boundary: terrain, **options).call

  test "returns the requested number of ranked points inside the terrain" do
    result = suggest(count: 5)
    assert_equal 5, result.points.size
    assert_equal [ 1, 2, 3, 4, 5 ], result.points.map(&:rank)
    result.points.each do |point|
      assert terrain.contains?(F.point(point.lng, point.lat))
    end
  end

  test "keeps clear of the boundary" do
    suggest(count: 12).points.each do |point|
      x, y = meters(point)
      assert_operator [ x, y, 100 - x, 100 - y ].min, :>=, 4.9, "#{x},#{y} is too close to the edge"
    end
  end

  test "spreads the points: four points land in four different quadrants" do
    quadrants = suggest(count: 4).points.map { |p| x, y = meters(p); [ x > 50, y > 50 ] }
    assert_equal 4, quadrants.uniq.size
  end

  test "avoids buildings and water, with a margin" do
    building = rectangle(30, 30, 70, 70) # the whole centre
    pond = F.polygon(F.linear_ring([ at(5, 5), at(25, 5), at(25, 25), at(5, 25), at(5, 5) ]))
    result = suggest(count: 10, obstacles: [ building, pond ])
    assert_equal 10, result.points.size
    result.points.each do |point|
      x, y = meters(point)
      assert_not (27..73).cover?(x) && (27..73).cover?(y), "#{x},#{y} is on the building"
      assert_not (2..28).cover?(x) && (2..28).cover?(y), "#{x},#{y} is in the pond"
    end
    assert_operator result.usable_area_m2, :<, 90 * 90
  end

  test "paths count as obstacles too" do
    path = F.line_string([ at(0, 50), at(100, 50) ])
    suggest(count: 8, obstacles: [ path ]).points.each do |point|
      assert_operator (meters(point)[1] - 50).abs, :>=, 2.9
    end
  end

  test "is repeatable" do
    assert_equal suggest(count: 6).points.map(&:to_h), suggest(count: 6).points.map(&:to_h)
  end

  test "points already placed are kept apart from the new ones" do
    existing = [ at(50, 50) ]
    result = suggest(count: 3, existing:)
    assert_equal 3, result.points.size
    result.points.each do |point|
      x, y = meters(point)
      assert_operator Math.hypot(x - 50, y - 50), :>=, 15
    end
  end

  test "caps the number of points" do
    assert_equal SoilAnalysis::SamplingSuggestions::MAX_POINTS, suggest(count: 500).points.size
    assert_equal 1, suggest(count: 0).points.size
  end

  test "a small terrain keeps a smaller margin instead of giving nothing" do
    tiny = F.multi_polygon([ rectangle(0, 0, 8, 8) ])
    result = SoilAnalysis::SamplingSuggestions.new(boundary: tiny, count: 1).call
    assert_equal 1, result.points.size
  end

  test "nothing to suggest without a boundary or when everything is built" do
    assert_empty SoilAnalysis::SamplingSuggestions.new(boundary: nil).call.points
    covered = rectangle(-10, -10, 110, 110)
    assert_empty SoilAnalysis::SamplingSuggestions.new(boundary: terrain, obstacles: [ covered ], count: 3).call.points
  end

  test "works on the boundary stored in the database" do
    result = SoilAnalysis::SamplingSuggestions.new(boundary: maps(:ahinvaux).boundary, count: 4).call
    assert_equal 4, result.points.size
    assert_operator result.usable_area_m2, :>, 100_000
  end
end
