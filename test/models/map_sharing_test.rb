require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class MapSharingTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
  end

  test "roles: owner, editors, viewers, team members" do
    editor = add_member(@map, make_user("Edith"), "editor")
    assert_equal "owner", @map.role_for(@owner)
    assert_equal "editor", @map.role_for(editor)
    assert_equal "viewer", @map.role_for(users(:alice))
    assert_nil @map.role_for(users(:bob))

    team = Organization.create!(name: "Semisto")
    team.memberships.create!(user: users(:bob), role: "designer")
    @map.update!(organization: team)
    assert_equal "editor", @map.role_for(users(:bob)), "team members edit the team's maps"
    assert_includes @map.participants, users(:bob)
  end

  test "team members edit without a membership of their own" do
    team = Organization.create!(name: "Semisto")
    @map.update!(organization: team)
    3.times { |i| team.memberships.create!(user: make_user("Team #{i}"), role: "designer") }
    3.times { |i| add_member(@map, make_user("Editor #{i}"), "editor") }
    assert_equal 3, @map.editors_count
  end

  test "grant_access! adds a viewer and never downgrades" do
    membership = @map.grant_access!(users(:bob), "viewer")
    assert_equal "viewer", membership.role
    editor = add_member(@map, make_user("Edith"), "editor")
    assert_equal "editor", @map.grant_access!(editor, "viewer").role
    assert_equal "owner", @map.grant_access!(@owner, "viewer").role
  end

  test "grant_access! upgrades a viewer to editor" do
    @map.grant_access!(users(:alice), "editor")
    assert_equal "editor", @map.memberships.find_by(user: users(:alice)).role
  end

  test "a fourth and fifth editor join by membership, invitation and share link" do
    3.times { |i| add_member(@map, make_user("Editor #{i}"), "editor") }

    # By membership.
    assert @map.memberships.create!(user: make_user("Fourth"), role: "editor").persisted?
    assert_equal "editor", @map.grant_access!(make_user("Fifth"), "editor").role

    # By invitation: pending editor invitations do not hold anything back.
    invitations = 2.times.map { |i| @map.invitations.create!(email_address: "invited#{i}@example.org", role: "editor", invited_by: @owner) }
    invitations.each { |invitation| assert_equal "editor", invitation.accept!(make_user("Invited #{invitation.id}")).role }

    # By share link.
    link = @map.create_share_link!(role: "editor", created_by: @owner)
    assert_equal "editor", link.accept!(users(:bob)).role
    assert_equal "editor", link.accept!(make_user("Linked")).role

    assert_equal 9, @map.editors_count
  end

  test "cannot invite someone who already has access" do
    invitation = @map.invitations.new(email_address: users(:alice).email_address, role: "viewer", invited_by: @owner)
    assert_not invitation.valid?
    assert invitation.errors.of_kind?(:email_address, :already_participant)
  end

  test "invitation accept! joins the map and is single use" do
    invitation = @map.invitations.create!(email_address: "new@example.org", role: "editor", invited_by: @owner)
    assert invitation.pending?
    membership = invitation.accept!(users(:bob))
    assert_equal "editor", membership.role
    assert_equal @owner, membership.invited_by
    assert invitation.reload.accepted?
    assert_not invitation.pending?
    assert_not_includes @map.invitations.pending, invitation
  end

  test "invitations expire after 30 days" do
    invitation = @map.invitations.create!(email_address: "late@example.org", invited_by: @owner)
    assert_in_delta 30.days.from_now, invitation.expires_at, 5
    travel_to 31.days.from_now do
      assert invitation.expired?
      assert_not_includes @map.invitations.pending, invitation
    end
  end

  test "share link: role-bound, reset gives a new token, disabled links do not accept" do
    link = @map.create_share_link!(role: "viewer", created_by: @owner)
    old = link.token
    assert link.enabled?
    link.reset!
    assert_not_equal old, link.token
    link.change_role!("editor")
    assert_equal "editor", link.role
    assert_not_equal old, link.token
    assert_equal "editor", link.accept!(users(:bob)).role

    link.disable!
    assert_not link.enabled?
    assert_raises(ActiveRecord::RecordNotFound) { link.accept!(users(:alice)) }
    assert_not MapShareLink.active.exists?(link.id)
  end
end
