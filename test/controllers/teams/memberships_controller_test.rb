require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

class Teams::MembershipsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = users(:michael)
    @member = users(:bob)
    @team = make_team(admin: @admin, members: [ @member ])
    @admin_membership = @team.membership_for(@admin)
    @member_membership = @team.membership_for(@member)
  end

  test "an admin changes a member's role" do
    sign_in_as @admin
    patch team_membership_path(@team, @member_membership), params: { membership: { role: "admin" } }
    assert_redirected_to team_path(@team)
    assert_equal "admin", @member_membership.reload.role

    patch team_membership_path(@team, @member_membership), params: { membership: { role: "owner" } }
    assert_equal I18n.t("teams.errors.role"), flash[:alert]
    assert_equal "admin", @member_membership.reload.role
  end

  test "a member cannot change roles, not even their own" do
    sign_in_as @member
    patch team_membership_path(@team, @member_membership), params: { membership: { role: "admin" } }
    assert_equal I18n.t("teams.errors.admin_only"), flash[:alert]
    assert_equal "member", @member_membership.reload.role
  end

  test "the last admin cannot step down" do
    sign_in_as @admin
    patch team_membership_path(@team, @admin_membership), params: { membership: { role: "member" } }
    assert_redirected_to team_path(@team)
    assert_equal I18n.t("teams.errors.last_admin_role"), flash[:alert]
    assert_equal "admin", @admin_membership.reload.role
  end

  test "an admin removes a member; their maps stay in the team" do
    bobs_map = Map.create!(name: "Verger", owner: @member, region: regions(:wallonia), organization: @team)
    sign_in_as @admin
    assert_difference -> { @team.memberships.count }, -1 do
      delete team_membership_path(@team, @member_membership)
    end
    assert_redirected_to team_path(@team)
    assert_not @team.member?(@member)
    assert_equal @team.id, bobs_map.reload.organization_id
    assert_equal "editor", bobs_map.role_for(@admin)
  end

  test "a member cannot remove someone else" do
    dana = make_user("Dana")
    other = @team.memberships.create!(user: dana, role: "member")
    sign_in_as @member
    assert_no_difference -> { @team.memberships.count } do
      delete team_membership_path(@team, other)
    end
    assert_equal I18n.t("teams.errors.admin_only"), flash[:alert]
  end

  test "a member leaves the team and loses access to its maps" do
    map = maps(:ahinvaux)
    map.update!(organization: @team)
    CommentSubscription.subscribe(@member, map)
    sign_in_as @member
    delete team_membership_path(@team, @member_membership)
    assert_redirected_to teams_path
    assert_equal I18n.t("teams.members.left", name: @team.name), flash[:notice]
    assert_nil map.role_for(@member)
    assert_not CommentSubscription.subscribed?(@member, map)

    get team_path(@team)
    assert_response :not_found
  end

  test "the last admin cannot leave; with another admin they can" do
    sign_in_as @admin
    assert_no_difference -> { @team.memberships.count } do
      delete team_membership_path(@team, @admin_membership)
    end
    assert_equal I18n.t("teams.errors.last_admin_leave"), flash[:alert]

    @member_membership.update!(role: "admin")
    delete team_membership_path(@team, @admin_membership)
    assert_redirected_to teams_path
    assert_not @team.member?(@admin)
  end

  test "memberships of another team are not found" do
    other_team = make_team("Autre", admin: users(:alice))
    sign_in_as @admin
    delete team_membership_path(@team, other_team.membership_for(users(:alice)))
    assert_response :not_found
    assert other_team.member?(users(:alice))
  end
end
