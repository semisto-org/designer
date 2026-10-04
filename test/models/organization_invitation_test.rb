require "test_helper"
require_relative "../test_helpers/teams_test_helper"

class OrganizationInvitationTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper

  setup do
    @admin = users(:michael)
    @team = make_team(admin: @admin)
  end

  def invite(email = "Dana@Example.org ", role: "member")
    @team.invitations.create!(email_address: email, role:, invited_by: @admin)
  end

  test "an invitation is normalized, tokenized and valid 30 days" do
    invitation = invite
    assert_equal "dana@example.org", invitation.email_address
    assert invitation.token.present?
    assert_in_delta 30.days.from_now, invitation.expires_at, 5
    assert invitation.pending?
    assert_includes @team.invitations.pending, invitation
  end

  test "an expired invitation is no longer pending" do
    invitation = invite
    invitation.update!(expires_at: 1.minute.ago)
    assert invitation.expired?
    assert_not invitation.pending?
    assert_not_includes @team.invitations.pending, invitation
  end

  test "rejects bad addresses, unknown roles and people already in the team" do
    assert_not @team.invitations.new(email_address: "pas-une-adresse", invited_by: @admin).valid?
    assert_not @team.invitations.new(email_address: "x@example.org", role: "owner", invited_by: @admin).valid?
    taken = @team.invitations.new(email_address: @admin.email_address.upcase, invited_by: @admin)
    assert_not taken.valid?
    assert taken.errors.of_kind?(:email_address, :already_member)
  end

  test "deliver! mails the invitation and renews it" do
    invitation = invite
    invitation.update_columns(expires_at: 2.days.from_now)
    assert_enqueued_emails 1 do
      invitation.deliver!
    end
    assert_in_delta 30.days.from_now, invitation.reload.expires_at, 5
    assert invitation.last_sent_at.present?
  end

  test "accept! adds the person with the invited role, once" do
    dana = make_user("Dana")
    membership = invite(role: "admin").accept!(dana)
    assert_equal "admin", membership.role
    assert @team.admin?(dana)
    assert @team.invitations.find_by(email_address: "dana@example.org").accepted?
  end

  test "accept! never downgrades an admin, and can promote a member" do
    bob = users(:bob)
    @team.memberships.create!(user: bob, role: "member")
    invite("other@example.org", role: "admin").accept!(bob)
    assert_equal "admin", @team.role_for(bob)
    invite("third@example.org", role: "member").accept!(bob)
    assert_equal "admin", @team.role_for(bob)
  end
end
