require "test_helper"

class MapVisitTest < ActiveSupport::TestCase
  test "keeps one row per person and map, with the last opening" do
    user, map = users(:michael), maps(:ahinvaux)
    MapVisit.record(user, map, at: 2.days.ago)
    MapVisit.record(user, map, at: 1.hour.ago)
    assert_equal 1, MapVisit.where(user:, map:).count
    assert_in_delta 1.hour.ago, MapVisit.opened_at_by_map(user, [ map.id ])[map.id], 1
  end

  test "goes away with its map" do
    map = users(:alice).owned_maps.create!(name: "Le verger", region: regions(:wallonia))
    MapVisit.record(users(:michael), map)
    map.destroy!
    assert_not MapVisit.exists?(map_id: map.id)
  end
end
