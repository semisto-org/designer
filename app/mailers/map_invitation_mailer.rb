class MapInvitationMailer < ApplicationMailer
  def invite(invitation)
    @invitation = invitation
    @map = invitation.map
    @inviter = invitation.invited_by
    @url = invitation_url(invitation.token)
    mail to: invitation.email_address,
         subject: t(".subject", inviter: @inviter.display_name, map: @map.name)
  end
end
