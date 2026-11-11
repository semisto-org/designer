require "test_helper"

class Maps::WaterLinksControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @tank = @map.features.create!(layer: "water", kind: "water_tank", geometry: { "type" => "Point", "coordinates" => [ 4.95, 50.3 ] },
                                  properties: { "above_ground_m" => 1.5 })
    @link = @map.features.create!(layer: "water", kind: "overflow_pipe",
                                  geometry: { "type" => "LineString", "coordinates" => [ [ 4.950012, 50.3 ], [ 4.951, 50.3 ] ] })
  end

  test "everyone on the map reads what a line connects and its drop" do
    sign_in_as users(:alice)
    get map_water_link_path(@map, @link), as: :json
    assert_response :success
    assert_equal @tank.id, response.parsed_body.dig("from", "id")
    assert_equal 1.5, response.parsed_body["dropM"]
  end

  test "a tank answers the lines that leave it" do
    sign_in_as users(:alice)
    get map_water_link_path(@map, @tank), as: :json
    assert_equal [ @link.id ], response.parsed_body["links"].map { _1["id"] }
  end

  test "strangers are kept out" do
    get map_water_link_path(@map, @link), as: :json
    assert_response :unauthorized
  end
end
