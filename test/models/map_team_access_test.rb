require "test_helper"
require_relative "../test_helpers/teams_test_helper"
require_relative "../test_helpers/billing_test_helper"

# How a team changes who can do what on a map (Map#role_for, participants,
# mentions, plan). Team admins get no more than members on a map.
class MapTeamAccessTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @owner = users(:michael)
    @team_admin = make_user("Ada")
    @team_member = users(:bob)
    @team = make_team(admin: @team_admin, members: [ @team_member, @owner ])
    @map.update!(organization: @team)
  end

  test "every team member edits; a team admin is an editor, not a manager" do
    assert_equal "owner", @map.role_for(@owner)
    assert_equal "editor", @map.role_for(@team_member)
    assert_equal "editor", @map.role_for(@team_admin)
    assert @map.editable_by?(@team_admin)
    assert_not @map.manageable_by?(@team_admin), "sharing stays with the owner"
    assert_nil @map.role_for(make_user("Stranger"))
  end

  test "a direct viewer who is in the team edits" do
    @team.memberships.create!(user: users(:alice), role: "member")
    assert_equal "editor", @map.role_for(users(:alice))
  end

  test "the team's members are participants: mentionable and notified" do
    assert_includes @map.participants, @team_member
    assert_includes @map.participants, @team_admin
    comment = @map.comments.create!(author: @owner, body: "Qu'en penses-tu @Bob ?")
    assert_equal [ @team_member.id ], comment.mentioned_user_ids
    assert_equal [ @team_member ], Collab::CommentNotifier.new(comment).deliver(only_mentions: [ @team_member.id ])
  end

  test "a former member is no longer a participant" do
    @team.membership_for(@team_member).destroy!
    assert_not_includes @map.reload.participants, @team_member
    assert_nil @map.role_for(@team_member)
  end

  test "a map out of the team is back to its own sharing" do
    @map.update!(organization: nil)
    assert_nil @map.role_for(@team_member)
    assert_equal "viewer", @map.role_for(users(:alice))
  end

  test "team members do not take editor seats, and inviting them is refused" do
    assert_equal 0, @map.editors_count
    invitation = @map.invitations.new(email_address: @team_member.email_address, role: "editor", invited_by: @owner)
    assert_not invitation.valid?
    assert invitation.errors.of_kind?(:email_address, :already_participant)
  end

  test "a team map follows its owner's plan, never a member's" do
    with_billing do
      @team_admin.plan_purchases.create!(plan_key: "yearly", starts_at: 1.day.ago, expires_at: 1.year.from_now, stripe_checkout_session_id: "cs_team")
      assert_equal "free", Entitlements.for_map(@map).plan
      assert_not Entitlements.for_map(@map).pdf_export?

      Map.create!(name: "Plus ancienne", owner: @owner, region: regions(:wallonia), created_at: 1.year.ago)
      assert @map.read_only_by_plan?, "the owner's free plan covers one map, team or not"
    end
  end
end
