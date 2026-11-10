require "test_helper"
require_relative "../test_helpers/mcp_test_helper"
require_relative "../test_helpers/drone_test_helper"

# get_map tells an AI which drone views the map has, and whether a person
# realigned them (« Recaler la vue » stays a human gesture in the editor).
class McpDroneViewsTest < ActionDispatch::IntegrationTest
  include McpTestHelper
  include DroneTestHelper

  test "get_map lists the drone views and their last realignment" do
    map = maps(:ahinvaux)
    view = imported_view(map, users(:michael), bytes: Random.bytes(10.kilobytes), status: "ready")
    view.update_columns(alignments: [ { "pairs" => [ { "from" => [ 4.87, 50.33 ], "to" => [ 4.87003, 50.33 ] } ], "status" => "done",
                                        "shift_m" => 2.1, "at" => "2026-11-10T20:00:00Z", "finished_at" => "2026-11-10T20:03:00Z" } ])

    data, error = call_tool(personal_token(users(:michael)), "get_map", { map_id: map.id })
    refute error, data
    drone = data["drone_views"].sole
    assert_equal [ view.id, "2027-05-12", "orthophoto", false ], drone.values_at("id", "captured_on", "product", "realignable")
    assert_equal({ "count" => 1, "last_at" => "2026-11-10T20:03:00Z", "shift_m" => 2.1, "landmarks" => 1 }, drone["realigned"])
    refute drone.key?("realigning")
  end
end
