class TeamInvitationMailer < ApplicationMailer
  def invite(invitation)
    @invitation = invitation
    @team = invitation.organization
    @inviter = invitation.invited_by
    @url = accept_team_invitation_url(invitation.token)
    mail to: invitation.email_address,
         subject: t(".subject", inviter: @inviter.display_name, team: @team.name)
  end
end
