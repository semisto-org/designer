require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

class Teams::InvitationsControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup do
    @admin = users(:michael)
    @member = users(:bob)
    @team = make_team(admin: @admin, members: [ @member ])
  end

  test "an admin invites by e-mail; the mail goes out" do
    sign_in_as @admin
    assert_enqueued_emails 1 do
      post team_invitations_path(@team), params: { invitation: { email_address: " Dana@Example.org", role: "admin" } }
    end
    assert_redirected_to team_path(@team)
    assert_equal I18n.t("teams.invitations.sent", email: "dana@example.org"), flash[:notice]
    invitation = @team.invitations.sole
    assert_equal [ "dana@example.org", "admin", @admin ], [ invitation.email_address, invitation.role, invitation.invited_by ]
  end

  test "an unknown role falls back to member; inviting the same address again updates it" do
    sign_in_as @admin
    post team_invitations_path(@team), params: { invitation: { email_address: "dana@example.org", role: "owner" } }
    assert_equal "member", @team.invitations.sole.role
    assert_enqueued_emails 1 do
      post team_invitations_path(@team), params: { invitation: { email_address: "dana@example.org", role: "admin" } }
    end
    assert_equal "admin", @team.invitations.sole.role
  end

  test "bad addresses and people already in the team are refused on the field" do
    sign_in_as @admin
    { "pas-une-adresse" => "teams.errors.invalid_email", @member.email_address => "teams.errors.already_member" }.each do |email, key|
      assert_no_enqueued_emails do
        post team_invitations_path(@team), params: { invitation: { email_address: email } }, headers: inertia_headers
      end
      assert_redirected_to team_path(@team)
      get team_path(@team), headers: inertia_headers
      assert_equal I18n.t(key), response.parsed_body.dig("props", "errors", "email_address")
    end
    assert_equal 0, @team.invitations.count
  end

  test "members cannot invite" do
    sign_in_as @member
    assert_no_enqueued_emails do
      post team_invitations_path(@team), params: { invitation: { email_address: "dana@example.org" } }
    end
    assert_equal I18n.t("teams.errors.admin_only"), flash[:alert]
    assert_equal 0, @team.invitations.count
  end

  test "an admin resends and cancels a pending invitation" do
    invitation = @team.invitations.create!(email_address: "dana@example.org", invited_by: @admin)
    invitation.update_columns(expires_at: 1.day.from_now)
    sign_in_as @admin
    assert_enqueued_emails 1 do
      post resend_team_invitation_path(@team, invitation)
    end
    assert_in_delta 30.days.from_now, invitation.reload.expires_at, 5

    delete team_invitation_path(@team, invitation)
    assert_redirected_to team_path(@team)
    assert_not OrganizationInvitation.exists?(invitation.id)
  end

  test "accepted invitations cannot be resent or cancelled" do
    invitation = @team.invitations.create!(email_address: "dana@example.org", invited_by: @admin)
    invitation.accept!(make_user("Dana"))
    sign_in_as @admin
    delete team_invitation_path(@team, invitation)
    assert_response :not_found
  end
end
