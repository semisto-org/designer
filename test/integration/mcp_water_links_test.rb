require "test_helper"
require "test_helpers/mcp_test_helper"

# An AI reads a raised tank, what a pipe connects and the pressure gravity gives.
class McpWaterLinksTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @viewer = personal_token(users(:alice))
    @tank = @map.features.create!(layer: "water", kind: "water_tank", geometry: { "type" => "Point", "coordinates" => [ 4.95, 50.3 ] },
                                  properties: { "tank_type" => "ibc", "above_ground_m" => 2, "functions" => %w[irrigation livestock_watering] })
    @link = @map.features.create!(layer: "water", kind: "irrigation_line",
                                  geometry: { "type" => "LineString", "coordinates" => [ [ 4.950012, 50.3 ], [ 4.951, 50.3 ] ] })
  end

  test "get_feature gives a line's ends, drop and pressure, and a tank its lines" do
    data, error = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: @link.id })
    refute error, data
    links = data["water_links"]
    assert_equal @tank.id, links.dig("from", "id")
    assert_equal 2.0, links.dig("from", "above_ground_m")
    assert_equal 2.0, links["drop_m"]
    assert_in_delta 0.2, links["pressure_bar"], 0.01
    assert_equal false, links["relief"]

    data, error = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: @tank.id })
    refute error, data
    assert_equal [ @link.id ], data["water_links"]["links"].map { _1["id"] }
    assert_equal %w[irrigation livestock_watering], data.dig("properties", "functions")
  end

  test "get_element_functions knows irrigation and livestock watering" do
    data, error = call_tool(@viewer, "get_element_functions", { map_id: @map.id })
    refute error, data
    assert_includes data["functions"], "irrigation"
    assert_includes data["functions"], "livestock_watering"
    tank = data["entries"].find { _1["feature_ids"] == [ @tank.id ] }
    assert_equal %w[irrigation livestock_watering], tank["functions"]
  end
end
