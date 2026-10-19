require "test_helper"
require_relative "../test_helpers/collab_test_helper"
require_relative "../test_helpers/propagation_test_helper"

class SharedPlantingsTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @apple = plant_species(:apple)
    plant_in_ground!(@map, @apple, variety: plant_varieties(:reinette), planted_on: "2019-03-15")
    plant_in_ground!(@map, @apple, variety: plant_varieties(:reinette), planted_on: "2021-01-01", planted_on_precision: "year")
    plant_in_ground!(@map, @apple, planted_on: "2022-11-02")
    plant_in_ground!(@map, @apple, variety: plant_varieties(:boskoop), planted_on: nil) # only planned
    @bob = gardener_with_map
  end

  test "nothing is shown until an owner of the place chooses to" do
    assert_equal [], SharedPlantings.new(@apple, @bob).as_json
    @map.update!(shares_planted_palette: true)
    assert_equal [], SharedPlantings.new(@apple, @bob).as_json, "no place owner yet"
  end

  test "a shared place shows what is in the ground, since when, its region and a rounded distance, never its name" do
    share_place!
    place = SharedPlantings.new(@apple, @bob).as_json.sole
    assert_equal "Wallonie", place[:region]
    assert_equal 0, place[:distanceKm] % SharedPlantings::DISTANCE_STEP_KM
    assert_includes 50..75, place[:distanceKm]
    assert_equal "Jardin de Bob", place[:nearMap]
    assert place[:acceptsRequests]
    assert_equal [ [ "Reinette grise", 2, 2019 ], [ nil, 1, 2022 ] ], place[:plants].map { [ _1[:variety], _1[:count], _1[:since] ] }
    assert_not place.to_s.include?(@map.name)
  end

  test "people who already open the map, and archived maps, are left out" do
    share_place!
    assert_equal [], SharedPlantings.new(@apple, users(:alice)).as_json
    @map.archive!
    assert_equal [], SharedPlantings.new(@apple, @bob).as_json
  end
end
