require "test_helper"

class AerialViews::AlignmentTest < ActiveSupport::TestCase
  BOUNDS = { "west" => 4.875, "south" => 50.33, "east" => 4.877, "north" => 50.332 }.freeze

  # Metres east and north of a point, as [lng, lat].
  def offset(point, east:, north:)
    lng, lat = point
    [ lng + east / (111_320.0 * Math.cos(lat * Math::PI / 180)), lat + north / 110_574.0 ]
  end

  test "one landmark moves the view, without turning or scaling it" do
    from = [ 4.876, 50.331 ]
    alignment = AerialViews::Alignment.new([ { "from" => from, "to" => offset(from, east: 2, north: -1) } ]).check!(BOUNDS)
    assert_in_delta 1.0, alignment.scale, 1e-12
    assert_in_delta 0.0, alignment.rotation_deg, 1e-12
    assert_in_delta Math.sqrt(5), alignment.shift_m(BOUNDS), 0.05
  end

  test "two landmarks also turn and scale it, and land exactly where they were placed" do
    a = [ 4.8755, 50.3305 ]
    b = [ 4.8765, 50.3315 ]
    pairs = [ { from: a, to: offset(a, east: 1.5, north: 0.5) }, { from: b, to: offset(b, east: 0.5, north: 1.8) } ]
    alignment = AerialViews::Alignment.new(pairs).check!(BOUNDS)
    pairs.each do |pair|
      u, v = alignment.apply(*AerialViews::Alignment.mercator(*pair[:from]))
      lng, lat = AerialViews::Alignment.lng_lat(u, v)
      assert_in_delta pair[:to][0], lng, 1e-9
      assert_in_delta pair[:to][1], lat, 1e-9
    end
    refute_in_delta 0.0, alignment.rotation_deg, 0.01
  end

  test "the geotransform of the moved view follows the same transform" do
    from = [ 4.876, 50.331 ]
    alignment = AerialViews::Alignment.new([ { from:, to: offset(from, east: 3, north: 0) } ])
    gt = [ 542_000.0, 0.05, 0.0, 6_500_000.0, 0.0, -0.05 ]
    moved = alignment.geo_transform(gt)
    assert_in_delta gt[0] + alignment.transform[:tx], moved[0], 1e-6
    assert_equal gt[1..2], moved[1..2]
    assert_equal gt[4..5], moved[4..5]
  end

  test "what no drone is that far off from is refused, with why" do
    from = [ 4.876, 50.331 ]
    assert_equal "too_far", assert_raises(AerialViews::Alignment::Invalid) {
      AerialViews::Alignment.new([ { from:, to: offset(from, east: 400, north: 0) } ]).check!(BOUNDS)
    }.code
    a = [ 4.8755, 50.3305 ]
    b = [ 4.8765, 50.3305 ]
    assert_equal "too_distorted", assert_raises(AerialViews::Alignment::Invalid) {
      AerialViews::Alignment.new([ { from: a, to: a }, { from: b, to: offset(a, east: 0, north: 70) } ]).check!(BOUNDS)
    }.code
    assert_equal "too_close", assert_raises(AerialViews::Alignment::Invalid) {
      AerialViews::Alignment.new([ { from: a, to: a }, { from: offset(a, east: 0.5, north: 0), to: a } ]).transform
    }.code
    assert_equal "bad_point", assert_raises(AerialViews::Alignment::Invalid) { AerialViews::Alignment.new([ { from: [ "x" ], to: a } ]) }.code
    assert_equal "no_pairs", assert_raises(AerialViews::Alignment::Invalid) { AerialViews::Alignment.new([]) }.code
    assert_equal "too_many_pairs", assert_raises(AerialViews::Alignment::Invalid) { AerialViews::Alignment.new([ { from: a, to: a } ] * 4) }.code
  end
end
