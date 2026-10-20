require "test_helper"

class PermacultureZones::LookupTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @lookup = PermacultureZones::Lookup.new(@map)
  end

  def square(lng, lat, half)
    { "type" => "Polygon", "coordinates" => [ [ [ lng - half, lat - half ], [ lng + half, lat - half ], [ lng + half, lat + half ], [ lng - half, lat + half ], [ lng - half, lat - half ] ] ] }
  end

  def point(lng, lat) = { "type" => "Point", "coordinates" => [ lng, lat ] }

  def zone(number, half, status: "active")
    @map.features.create!(layer: "notes", kind: "permaculture_zone", status:, properties: { "zone_number" => number }, geometry: square(4.9, 50.34, half))
  end

  test "an element takes the lowest zone over it, and the dwelling is zone 0" do
    house = @map.features.create!(layer: "existing", kind: "building", properties: { "dwelling" => true }, geometry: square(4.9, 50.34, 0.00005))
    zone(1, 0.0003)
    zone(3, 0.002)
    zone(2, 0.001, status: "draft")
    compost = @map.features.create!(layer: "structures", kind: "compost", geometry: point(4.9002, 50.34))
    orchard = @map.features.create!(layer: "animals", kind: "beehive", geometry: point(4.9008, 50.34))
    far = @map.features.create!(layer: "animals", kind: "beehive", geometry: point(4.95, 50.34))
    chair = @map.features.create!(layer: "animals", kind: "beehive", geometry: point(4.90001, 50.34))
    path = @map.features.create!(layer: "access", kind: "path", geometry: { "type" => "LineString", "coordinates" => [ [ 4.8998, 50.34 ], [ 4.9018, 50.34 ] ] })

    zones = @lookup.for_features([ house, compost, orchard, far, chair, path ])
    assert_equal({ compost.id => 1, orchard.id => 3, chair.id => 0, path.id => 3 }, zones, "a draft zone does not count, a path stands halfway along")
    assert_equal 1, @lookup.for_feature(compost)
  end

  test "nothing without zones, and the zones themselves have none" do
    hive = @map.features.create!(layer: "animals", kind: "beehive", geometry: point(4.9, 50.34))
    assert_empty @lookup.for_features([ hive ])
    one = zone(1, 0.001)
    assert_equal({ hive.id => 1 }, PermacultureZones::Lookup.new(@map).for_features([ hive, one ]))
  end

  test "the library validates the zone number and the dwelling flag" do
    bad = @map.features.build(layer: "notes", kind: "permaculture_zone", properties: { "zone_number" => 6 }, geometry: square(4.9, 50.34, 0.001))
    refute bad.valid?
    house = @map.features.build(layer: "existing", kind: "building", properties: { "dwelling" => "oui" }, geometry: square(4.9, 50.34, 0.0001))
    refute house.valid?
    assert @map.features.build(layer: "notes", kind: "permaculture_zone", properties: { "zone_number" => 5 }, geometry: square(4.9, 50.34, 0.001)).valid?
  end
end
