require "test_helper"

class PermacultureZones::ProposalTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
  end

  def square(lng, lat, half_lng, half_lat = half_lng)
    { "type" => "Polygon", "coordinates" => [ [ [ lng - half_lng, lat - half_lat ], [ lng + half_lng, lat - half_lat ], [ lng + half_lng, lat + half_lat ], [ lng - half_lng, lat + half_lat ], [ lng - half_lng, lat - half_lat ] ] ] }
  end

  def house
    @map.features.create!(layer: "existing", kind: "building", properties: { "dwelling" => true }, geometry: square(4.905, 50.34, 0.00007, 0.000045))
  end

  test "rings around the house, cut to the terrain, with a path stretching zone 1" do
    # A terrain of about 240 m each side around the house.
    @map.update!(boundary: { "type" => "MultiPolygon", "coordinates" => [ square(4.905, 50.34, 0.0017, 0.00108)["coordinates"] ] })
    home = house
    zones = PermacultureZones::Proposal.new(@map, houses: [ home ]).call
    assert_equal [ 1, 2, 3, 4 ], zones.map { |z| z[:number] }.uniq
    zone1 = zones.find { |z| z[:number] == 1 }
    assert_equal "Polygon", zone1[:geometry]["type"]
    assert_in_delta 1300, zone1[:area_m2], 120
    total = zones.uniq { |z| z[:number] }.sum { |z| z[:area_m2] }
    terrain = MapFeature.connection.select_value("SELECT ST_Area(ST_GeomFromGeoJSON('#{RGeo::GeoJSON.encode(@map.boundary).to_json}')::geography)").to_f
    assert_in_delta terrain - 100, total, terrain * 0.01

    @map.features.create!(layer: "access", kind: "path", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.34 ], [ 4.9056, 50.34 ] ] })
    along = PermacultureZones::Proposal.new(@map, houses: [ home ]).call.find { |z| z[:number] == 1 }
    assert along[:area_m2] > zone1[:area_m2] + 50
  end

  test "nothing without a house or a boundary" do
    assert_empty PermacultureZones::Proposal.new(@map, houses: []).call
  end
end
