require "test_helper"
require_relative "../test_helpers/teams_test_helper"

class TeamInvitationMailerTest < ActionMailer::TestCase
  test "the invitation links to /teams/invitations/:token and says what a team is" do
    team = make_team("Semisto", admin: users(:michael))
    invitation = team.invitations.create!(email_address: "new@example.org", role: "member", invited_by: users(:michael))
    mail = TeamInvitationMailer.invite(invitation)
    assert_equal [ "new@example.org" ], mail.to
    assert_equal "Michael t'invite dans l'équipe « Semisto »", mail.subject
    assert_includes mail.html_part.body.to_s, "http://example.com/teams/invitations/#{invitation.token}"
    text = mail.text_part.body.to_s
    assert_includes text, "/teams/invitations/#{invitation.token}"
    assert_match(/modifient toutes ses cartes/, text)
    assert_no_match(/administrateur/, text)
    assert_match(/valable jusqu'au \d\d\/\d\d\/\d{4}/, text)
  end

  test "an admin invitation says so" do
    team = make_team("Semisto", admin: users(:michael))
    invitation = team.invitations.create!(email_address: "new@example.org", role: "admin", invited_by: users(:michael))
    assert_match(/en tant qu'administrateur/, TeamInvitationMailer.invite(invitation).text_part.body.to_s)
  end
end
