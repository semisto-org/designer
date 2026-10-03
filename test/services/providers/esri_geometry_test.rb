require "test_helper"

class Providers::EsriGeometryTest < ActiveSupport::TestCase
  E = Providers::EsriGeometry

  OUTER = [ [ 0, 0 ], [ 0, 10 ], [ 10, 10 ], [ 10, 0 ], [ 0, 0 ] ].freeze # clockwise
  HOLE = [ [ 2, 2 ], [ 4, 2 ], [ 4, 4 ], [ 2, 4 ], [ 2, 2 ] ].freeze     # counter-clockwise
  OTHER = [ [ 20, 0 ], [ 20, 5 ], [ 25, 5 ], [ 25, 0 ], [ 20, 0 ] ].freeze

  test "outer rings become polygons, holes go to the ring that contains them" do
    geojson = E.to_geojson("rings" => [ OUTER, OTHER, HOLE ])
    assert_equal "MultiPolygon", geojson["type"]
    assert_equal [ [ OUTER, HOLE ], [ OTHER ] ], geojson["coordinates"]
  end

  test "closes open rings and drops degenerate ones" do
    open_ring = OUTER[0..3]
    geojson = E.to_geojson("rings" => [ open_ring, [ [ 1, 1 ], [ 2, 2 ] ] ])
    assert_equal [ [ OUTER ] ], geojson["coordinates"]
  end

  test "a lone counter-clockwise ring is still an outer ring" do
    assert_equal [ [ HOLE ] ], E.to_geojson("rings" => [ HOLE ])["coordinates"]
  end

  test "invalid input" do
    assert_raises(E::Invalid) { E.to_geojson(nil) }
    assert_raises(E::Invalid) { E.to_geojson("rings" => [ [ [ "a", "b" ] ] ]) }
  end
end
