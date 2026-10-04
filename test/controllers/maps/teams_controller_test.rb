require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

# Moving a map in and out of a team, from its sharing dialog (owner only).
class Maps::TeamsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @owner = users(:michael)
    @colleague = users(:bob)
    @team = make_team("Semisto", admin: @owner, members: [ @colleague ])
  end

  test "the owner confides the map to one of their teams" do
    lock_version = @map.lock_version
    updated_at = @map.updated_at
    sign_in_as @owner
    patch map_team_path(@map), params: { map: { team_id: @team.id } }, as: :json
    assert_response :success
    assert_equal({ "id" => @team.id, "name" => "Semisto", "members" => 2 }, json["organization"])
    assert_equal [ { "id" => @team.id, "name" => "Semisto" } ], json["teams"]
    assert_equal @team.id, @map.reload.organization_id
    assert_equal "editor", @map.role_for(@colleague)
    assert_equal lock_version, @map.lock_version, "sharing is not an edit: no conflict for open editors"
    assert_equal updated_at, @map.updated_at
  end

  test "only into a team the owner belongs to" do
    other = make_team("Autre", admin: users(:alice))
    sign_in_as @owner
    patch map_team_path(@map), params: { map: { team_id: other.id } }, as: :json
    assert_response :unprocessable_entity
    assert_equal I18n.t("teams.map.errors.not_member"), json["message"]
    assert_nil @map.reload.organization_id
  end

  test "editors, viewers and team members (admins included) cannot move it" do
    @map.update!(organization: @team)
    admin = make_user("Ada")
    @team.memberships.create!(user: admin, role: "admin")
    [ admin, @colleague, users(:alice) ].each do |user|
      sign_in_as user
      patch map_team_path(@map), params: { map: { team_id: nil } }, as: :json
      assert_response :forbidden
    end
    assert_equal @team.id, @map.reload.organization_id

    sign_in_as make_user("Stranger")
    patch map_team_path(@map), params: { map: { team_id: nil } }, as: :json
    assert_response :not_found
  end

  test "taking the map out drops the team's access, keeps the invited people" do
    @map.update!(organization: @team)
    CommentSubscription.subscribe(@colleague, @map)
    CommentSubscription.subscribe(users(:alice), @map)
    sign_in_as @owner
    patch map_team_path(@map), params: { map: { team_id: "" } }, as: :json
    assert_response :success
    assert_nil json["organization"]
    assert_nil @map.reload.organization_id
    assert_nil @map.role_for(@colleague)
    assert_not CommentSubscription.subscribed?(@colleague, @map)
    assert_equal "viewer", @map.role_for(users(:alice))
    assert CommentSubscription.subscribed?(users(:alice), @map)
  end

  test "an owner who left the team can still take their map out" do
    second_admin = make_user("Ada")
    @team.memberships.create!(user: second_admin, role: "admin")
    @map.update!(organization: @team)
    @team.membership_for(@owner).destroy!
    assert_equal @team.id, @map.reload.organization_id, "the map stays with the team"

    sign_in_as @owner
    get map_sharing_path(@map), as: :json
    assert_equal @team.id, json.dig("organization", "id")
    assert_equal [], json["teams"]
    patch map_team_path(@map), params: { map: { team_id: nil } }, as: :json
    assert_response :success
    assert_nil @map.reload.organization_id
  end

  test "the sharing dialog lists the owner's teams to the owner only" do
    @map.update!(organization: @team)
    sign_in_as @colleague
    get map_sharing_path(@map), as: :json
    assert_equal "editor", json["role"]
    assert_nil json["teams"]
    assert_equal "Semisto", json.dig("organization", "name")
    assert json["members"].none? { |m| m["you"] }, "team access is not a map membership"
  end
end
