class MapInvitationMailer < ApplicationMailer
  # A reader is most often the person the garden is designed for: the e-mail
  # speaks of the plan they receive, and points to the guide to read it.
  READER_GUIDE = "tu-as-recu-le-plan-de-ton-jardin".freeze

  def invite(invitation)
    @invitation = invitation
    @map = invitation.map
    @inviter = invitation.invited_by
    @url = invitation_url(invitation.token)
    @viewer = invitation.role == "viewer"
    @guide = HelpArticle.find(READER_GUIDE) if @viewer
    @guide_url = help_article_url(READER_GUIDE) if @guide
    show_place(@map)
    mail to: invitation.email_address,
         subject: t(@viewer ? ".subject_viewer" : ".subject", inviter: @inviter.display_name, map: @map.name)
  end
end
