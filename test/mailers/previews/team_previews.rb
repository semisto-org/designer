# Preview the team invitation e-mail in development: /rails/mailers
class TeamInvitationMailerPreview < ActionMailer::Preview
  def invite
    inviter = User.first || User.new(name: "Camille", email_address: "camille@example.org")
    team = Organization.new(name: "Bureau d'études")
    invitation = OrganizationInvitation.new(organization: team, email_address: "dominique@example.org", role: "member",
                                            invited_by: inviter, token: "apercu", expires_at: 30.days.from_now)
    TeamInvitationMailer.invite(invitation)
  end
end
