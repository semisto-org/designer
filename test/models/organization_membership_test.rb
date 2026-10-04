require "test_helper"
require_relative "../test_helpers/teams_test_helper"

class OrganizationMembershipTest < ActiveSupport::TestCase
  setup do
    @admin = users(:michael)
    @member = users(:bob)
    @team = make_team(admin: @admin, members: [ @member ])
    @admin_membership = @team.membership_for(@admin)
    @member_membership = @team.membership_for(@member)
  end

  test "roles are admin and member; the first draft's roles mean member" do
    assert_equal %w[admin member], OrganizationMembership::ROLES
    legacy = @team.memberships.create!(user: make_user("Stagiaire"), role: "intern")
    assert_equal "member", legacy.role
    assert_equal "member", @team.memberships.create!(user: make_user("Designer"), role: "designer").role
    assert_not @team.memberships.new(user: make_user("X"), role: "owner").valid?
    assert_equal "member", @team.memberships.create!(user: make_user("Default")).role, "member by default"
  end

  test "one membership per person and team" do
    assert_not @team.memberships.new(user: @member, role: "member").valid?
  end

  test "the last admin can neither leave nor be demoted" do
    assert @admin_membership.last_admin?
    assert_not @admin_membership.destroy
    assert OrganizationMembership.exists?(@admin_membership.id)

    assert_not @admin_membership.update(role: "member")
    assert @admin_membership.errors.of_kind?(:role, :last_admin)
    assert_equal "admin", @admin_membership.reload.role
  end

  test "with a second admin, an admin can step down or leave" do
    @member_membership.update!(role: "admin")
    assert_not @admin_membership.reload.last_admin?
    assert @admin_membership.update(role: "member")
    assert @member_membership.reload.last_admin?
    assert @admin_membership.destroy
  end

  test "members leave freely; their maps stay in the team, their access goes" do
    own_map = Map.create!(name: "Le verger de Bob", owner: @member, region: regions(:wallonia), organization: @team)
    team_map = maps(:ahinvaux)
    team_map.update!(organization: @team)
    CommentSubscription.subscribe(@member, team_map)
    feature = with_feature(team_map)
    CommentSubscription.subscribe(@member, feature)
    CommentSubscription.subscribe(@admin, feature)

    assert_equal "editor", team_map.role_for(@member)
    assert @member_membership.destroy

    assert_nil team_map.role_for(@member)
    assert_not CommentSubscription.subscribed?(@member, team_map), "subscriptions on maps they cannot open go"
    assert_not CommentSubscription.subscribed?(@member, feature), "element threads too"
    assert CommentSubscription.subscribed?(@admin, feature)
    assert_equal @team.id, own_map.reload.organization_id, "their own map stays in the team"
    assert_equal "owner", own_map.role_for(@member)
    assert_equal "editor", own_map.role_for(@admin), "the team keeps working on it"
  end

  test "leaving keeps access to maps one is invited on" do
    team_map = maps(:ahinvaux)
    team_map.update!(organization: @team)
    add_member(team_map, @member, "viewer")
    CommentSubscription.subscribe(@member, team_map)
    @member_membership.destroy!
    assert_equal "viewer", team_map.role_for(@member)
    assert CommentSubscription.subscribed?(@member, team_map)
  end
end
