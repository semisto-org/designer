require "test_helper"
require_relative "../test_helpers/teams_test_helper"

class TeamsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = users(:michael)
    @member = users(:bob)
    @outsider = users(:alice)
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
  end

  def props = response.parsed_body["props"]

  test "requires sign in" do
    get teams_path
    assert_redirected_to new_session_path
  end

  test "lists my teams only, with my role and counts" do
    make_team("Autre équipe", admin: @outsider)
    sign_in_as @member
    get teams_path, headers: inertia_headers
    assert_response :success
    assert_equal "teams/index", response.parsed_body["component"]
    assert_equal [ { "id" => @team.id, "name" => "Semisto", "role" => "member", "membersCount" => 2, "mapsCount" => 1 } ], props["teams"]
  end

  test "creates a team with me as its admin" do
    sign_in_as @outsider
    assert_difference -> { Organization.count } do
      post teams_path, params: { team: { name: "Les Jardins du Bocage" } }
    end
    team = Organization.order(:id).last
    assert_redirected_to team_path(team)
    assert_equal "admin", team.role_for(@outsider)
  end

  test "a blank name is refused with an error on the field" do
    sign_in_as @outsider
    assert_no_difference -> { Organization.count } do
      post teams_path, params: { team: { name: " " } }, headers: inertia_headers
    end
    assert_redirected_to teams_path
    get teams_path, headers: inertia_headers
    assert_equal [ "ne peut pas être vide" ], Array(props.dig("errors", "name"))
    assert_no_difference -> { Organization.count } do
      post teams_path, params: {}
    end
  end

  test "a member sees the team, its members and maps, but no e-mail nor invitation" do
    @team.invitations.create!(email_address: "dana@example.org", invited_by: @admin)
    sign_in_as @member
    get team_path(@team), headers: inertia_headers
    assert_response :success
    assert_equal "teams/show", response.parsed_body["component"]
    assert_equal({ "id" => @team.id, "name" => "Semisto", "role" => "member" }, props["team"].slice("id", "name", "role"))
    assert_equal [ "Michael", "Bob" ], props["members"].map { |m| m["name"] }
    assert props["members"].all? { |m| m["email"].nil? }
    assert_equal [ true, false ], props["members"].map { |m| m["lastAdmin"] }
    assert_equal 1, props["members"].first["mapsCount"]
    assert_equal [ [ @map.id, false, true ] ], props["maps"].map { |m| m.values_at("id", "ownedByYou", "ownerInTeam") }
    assert_nil props["invitations"]
  end

  test "an admin also sees e-mails and pending invitations" do
    @team.invitations.create!(email_address: "dana@example.org", invited_by: @admin)
    sign_in_as @admin
    get team_path(@team), headers: inertia_headers
    assert_includes props["members"].map { |m| m["email"] }, @member.email_address
    assert_equal [ "dana@example.org" ], props["invitations"].map { |i| i["email"] }
  end

  test "outsiders get a 404, whether the team exists or not" do
    sign_in_as @outsider
    get team_path(@team)
    assert_response :not_found
    get team_path(0)
    assert_response :not_found
    patch team_path(@team), params: { team: { name: "Pris" } }
    assert_response :not_found
    delete team_path(@team)
    assert_response :not_found
    assert_equal "Semisto", @team.reload.name
  end

  test "admins rename the team, members cannot" do
    sign_in_as @member
    patch team_path(@team), params: { team: { name: "Renommée" } }
    assert_redirected_to team_path(@team)
    assert_equal I18n.t("teams.errors.admin_only"), flash[:alert]
    assert_equal "Semisto", @team.reload.name

    sign_in_as @admin
    patch team_path(@team), params: { team: { name: "Semisto · bureau d'études" } }
    assert_redirected_to team_path(@team)
    assert_equal "Semisto · bureau d'études", @team.reload.name

    patch team_path(@team), params: { team: { name: "" } }
    assert_equal "Semisto · bureau d'études", @team.reload.name
  end

  test "admins delete the team: maps go back to their owners, nothing else is deleted" do
    CommentSubscription.subscribe(@member, @map)
    sign_in_as @member
    delete team_path(@team)
    assert Organization.exists?(@team.id)

    sign_in_as @admin
    assert_difference -> { Organization.count } => -1, -> { Map.count } => 0 do
      delete team_path(@team)
    end
    assert_redirected_to teams_path
    assert_nil @map.reload.organization_id
    assert_equal "owner", @map.role_for(@admin)
    assert_nil @map.role_for(@member)
    assert_not CommentSubscription.subscribed?(@member, @map)
  end

  test "the shared props count my teams (the nav link shows once I am in one)" do
    sign_in_as @outsider
    get maps_path, headers: inertia_headers
    assert_equal 0, props.dig("currentUser", "teamsCount")
    sign_in_as @member
    get maps_path, headers: inertia_headers
    assert_equal 1, props.dig("currentUser", "teamsCount")
  end

  test "the maps list puts team maps under their team" do
    own = Map.create!(name: "Mon potager", owner: @member, region: regions(:wallonia))
    sign_in_as @member
    get maps_path, headers: inertia_headers
    maps = props["maps"].to_h { |m| [ m["id"], m ] }
    assert_equal [ @team.id, "editor" ], maps[@map.id].values_at("teamId", "role")
    assert_nil maps[own.id]["teamId"]
    assert_equal [ { "id" => @team.id, "name" => "Semisto" } ], props["teams"]
  end
end
