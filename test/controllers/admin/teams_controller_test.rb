require "test_helper"
require "test_helpers/teams_test_helper"

class Admin::TeamsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @team = make_team("Semisto Design Labs", admin: users(:michael))
  end

  test "hidden from everyone but admins" do
    sign_in_as users(:michael)
    get admin_teams_path
    assert_response :not_found
    patch admin_team_path(@team), params: { territory_module: "grant" }
    assert_response :not_found
    refute @team.reload.territory_module?
  end

  test "lists the teams with their module" do
    sign_in_as @admin
    get admin_teams_path, headers: inertia_headers
    row = response.parsed_body["props"]["teams"].sole
    assert_equal [ "Semisto Design Labs", 1, nil ], row.values_at("name", "membersCount", "territoryModule")
  end

  test "grants and takes back « Territoire », in the admin log" do
    sign_in_as @admin
    patch admin_team_path(@team), params: { territory_module: "grant" }
    assert_redirected_to admin_teams_path
    assert @team.reload.territory_module?
    assert_equal [ "territory_module_granted", "Semisto Design Labs" ], [ AdminEvent.last.action, AdminEvent.last.as_admin_json[:target][:name] ]

    patch admin_team_path(@team), params: { territory_module: "revoke" }
    refute @team.reload.territory_module?
    assert_equal "territory_module_revoked", AdminEvent.last.action
  end

  test "refuses an unknown choice" do
    sign_in_as @admin
    patch admin_team_path(@team), params: { territory_module: "maybe" }
    assert_response :unprocessable_entity
  end
end
