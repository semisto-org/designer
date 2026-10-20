require "test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/drone_pilots_test_helper"

# The user's AI finds the drone pilots who fly to a map, and follows the
# missions booked there; booking and paying stay with the person.
class McpDronePilotsTest < ActionDispatch::IntegrationTest
  include DronePilotsTestHelper

  setup do
    @map = maps(:ahinvaux)
    @pilot = create_pilot(users(:bob))
    create_pilot(users(:alice), service_radius_km: 5)
  end

  test "list_drone_pilots gives the pilots in range with the price for this place" do
    data, error = call_tool(personal_token(users(:michael)), "list_drone_pilots", { map_id: @map.id })
    refute error, data
    pilot = data["pilots"].sole
    assert_equal @pilot.id, pilot["id"]
    assert_equal 70_00, pilot.dig("quote", "commissionCents")
    assert_includes pilot["url"], "/pilotes-drone/#{@pilot.id}"
    refute pilot.key?("businessNumber")

    data, = call_tool(personal_token(users(:michael)), "list_drone_pilots", { map_id: @map.id, include_out_of_range: true, data_types: %w[thermal] })
    assert_equal 2, data["pilots"].size
    data, = call_tool(personal_token(users(:michael)), "list_drone_pilots", { map_id: @map.id, data_types: %w[point_cloud] })
    assert_empty data["pilots"]
  end

  test "list_drone_missions follows a mission and what was delivered, for editors only" do
    mission = paid_mission(pilot: @pilot, client: users(:michael), map: @map)
    data, error = call_tool(personal_token(users(:michael)), "list_drone_missions", { map_id: @map.id })
    refute error, data
    assert_equal [ mission.id, "paid" ], data["missions"].sole.values_at("id", "status")

    _, error = call_tool(personal_token(users(:alice)), "list_drone_missions", { map_id: @map.id })
    assert error
  end
end
