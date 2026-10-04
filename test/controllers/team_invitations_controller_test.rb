require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# The link of a team invitation e-mail: /teams/invitations/:token.
class TeamInvitationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = users(:michael)
    @bob = users(:bob)
    @team = make_team("Semisto", admin: @admin)
  end

  def invite(role: "member")
    @team.invitations.create!(email_address: "bob@example.org", role:, invited_by: @admin)
  end

  test "signed-out visitor signs in first, then lands back on the invitation and joins" do
    invitation = invite
    get accept_team_invitation_path(invitation.token)
    assert_redirected_to new_session_path
    follow_redirect!
    assert_equal I18n.t("teams.joining.sign_in_first", team: "Semisto"), flash[:notice]
    assert_not @team.member?(@bob)

    get magic_link_path(@bob.generate_token_for(:magic_link), return_to: accept_team_invitation_path(invitation.token))
    assert_redirected_to accept_team_invitation_path(invitation.token)
    follow_redirect!
    assert_redirected_to team_path(@team)
    assert_equal "member", @team.role_for(@bob)
    assert invitation.reload.accepted?
  end

  test "signed-in user joins with the invited role" do
    invitation = invite(role: "admin")
    sign_in_as @bob
    get accept_team_invitation_path(invitation.token)
    assert_redirected_to team_path(@team)
    assert_equal I18n.t("teams.joining.joined", team: "Semisto"), flash[:notice]
    assert @team.admin?(@bob)
  end

  test "an accepted invitation is single use, but its user can reopen it" do
    invitation = invite
    invitation.accept!(@bob)
    sign_in_as @bob
    get accept_team_invitation_path(invitation.token)
    assert_redirected_to team_path(@team)

    carol = make_user("Carol")
    sign_in_as carol
    get accept_team_invitation_path(invitation.token), headers: inertia_headers
    assert_response :gone
    assert_equal({ "state" => "used", "teamName" => "Semisto" }, response.parsed_body["props"].slice("state", "teamName"))
    assert_not @team.member?(carol)
  end

  test "expired and unknown invitations" do
    invitation = invite
    invitation.update!(expires_at: 1.minute.ago)
    sign_in_as @bob
    get accept_team_invitation_path(invitation.token), headers: inertia_headers
    assert_response :gone
    assert_equal "expired", response.parsed_body["props"]["state"]
    assert_not @team.member?(@bob)

    get accept_team_invitation_path("nope"), headers: inertia_headers
    assert_response :not_found
    assert_equal "team_invitations/show", response.parsed_body["component"]
    assert_equal "invalid", response.parsed_body["props"]["state"]
  end

  test "an unknown token does not ask to sign in" do
    get accept_team_invitation_path("nope"), headers: inertia_headers
    assert_response :not_found
  end
end
