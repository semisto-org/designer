require "test_helper"
require_relative "../test_helpers/mcp_test_helper"

# get_map tells an AI what this month asks of the place: what the plants do
# and which signs of the season the person still has to go out and see.
class McpThisMonthTest < ActionDispatch::IntegrationTest
  include McpTestHelper

  test "get_map gives this month's plants and signs to go and see" do
    map = maps(:ahinvaux)
    point = RGeo::Geographic.spherical_factory(srid: 4326).point(4.906, 50.341)
    map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: { "species_id" => plant_species(:apple).id })
    travel_to Time.zone.local(2026, 4, 14, 10) do
      data, error = call_tool(personal_token(users(:michael)), "get_map", { map_id: map.id })
      refute error, data
      month = data["this_month"]
      assert_equal 4, month["month"]
      assert_equal 1, month.dig("plants", "flowering", "count")
      assert_equal %w[budburst last_frost nest], month["signs"].map { _1["sign"] }
      assert_equal %w[budburst last_frost nest], month["unobserved"]
    end
  end
end
