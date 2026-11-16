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
    assert_equal [ @team.id, "admin", true ], team.values_at("id", "role", "can_see_activity")
    bob = team["members"].find { |m| m["name"] == "Bob" }
    assert_equal 3, bob["days_since_active"]
    assert bob["last_active_at"]
    assert_not_includes data.to_json, @member.email_address
  end

  test "a member reads the members, not their activity" do
    data, = call_tool(personal_token(@member), "list_teams")
    team = data["teams"].sole
    assert_equal false, team["can_see_activity"]
    assert team["members"].none? { |m| m.key?("last_active_at") }
  end
end
