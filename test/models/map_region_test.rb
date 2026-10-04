require "test_helper"
require_relative "../support/regions_test_helper"

class MapRegionTest < ActiveSupport::TestCase
  include RegionsTestHelper

  setup { seed_regions }

  def point(lng, lat) = GeoJsonGeometry::FACTORY.point(lng, lat)

  test "a new map joins the region of its place" do
    map = Map.create!(name: "Jardin lillois", owner: users(:michael), center: point(3.06, 50.63))
    assert_equal "france", map.region.key
    map = Map.create!(name: "Jardin d'Esch", owner: users(:michael), center: point(5.98, 49.5))
    assert_equal "luxembourg", map.region.key
  end

  test "without a place, a new map starts on the European base" do
    assert_equal "europe", Map.create!(name: "Quelque part", owner: users(:michael)).region.key
  end

  test "a European map moves to a region once its place is known" do
    map = Map.create!(name: "Jardin berlinois", owner: users(:michael), center: point(13.4, 52.5))
    assert_equal "europe", map.region.key
    map.update!(center: point(4.88, 50.33))
    assert_equal "wallonia", map.reload.region.key
  end

  test "a map never leaves a real region on its own" do
    map = Map.create!(name: "Jardin", owner: users(:michael), center: point(4.88, 50.33))
    map.update!(center: point(3.06, 50.63))
    assert_equal "wallonia", map.reload.region.key
  end

  test "an explicit region is kept" do
    map = Map.create!(name: "Jardin", owner: users(:michael), region: region("france"), center: point(4.88, 50.33))
    assert_equal "france", map.region.key
  end
end
