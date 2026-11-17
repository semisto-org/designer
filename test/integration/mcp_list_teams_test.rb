require "test_helper"
require_relative "../test_helpers/mcp_test_helper"
require_relative "../test_helpers/teams_test_helper"

class McpListTeamsTest < ActionDispatch::IntegrationTest
  include McpTestHelper

  setup do
    @admin = users(:michael)
    @member = users(:bob)
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
    @member.update_column(:last_active_at, 3.days.ago)
  end

  test "an admin reads the members and when each was last active, without e-mails" do
    data, error = call_tool(personal_token(@admin), "list_teams")
    assert_not error, data
    team = data["teams"].sole
    assert_equal [ @team.id, "admin" ], team.values_at("id", "role")
    bob = team["members"].find { |m| m["name"] == "Bob" }
    assert_equal 3, bob["days_since_active"]
    assert bob["last_active_at"]
    assert_not_includes data.to_json, @member.email_address
  end

  test "a member reads the members and their activity too" do
    @admin.update_column(:last_active_at, 10.days.ago)
    data, = call_tool(personal_token(@member), "list_teams")
    team = data["teams"].sole
    assert_equal [ @team.id, "member" ], team.values_at("id", "role")
    assert_equal 10, team["members"].find { |m| m["name"] == "Michael" }["days_since_active"]
  end
end
