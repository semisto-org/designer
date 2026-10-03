# Preview the collaboration e-mails in development: /rails/mailers
class MapInvitationMailerPreview < ActionMailer::Preview
  def invite
    map = Map.first!
    invitation = map.invitations.first || map.invitations.build(email_address: "camille@example.org", role: "editor", invited_by: map.owner, token: "apercu", expires_at: 30.days.from_now)
    MapInvitationMailer.invite(invitation)
  end
end

class CommentMailerPreview < ActionMailer::Preview
  def mentioned
    comment = Comment.where.not(mentioned_user_ids: []).last || Comment.last!
    CommentMailer.mentioned(comment, comment.mentioned_users.first || comment.author)
  end

  def new_comment
    comment = Comment.last!
    CommentMailer.new_comment(comment, comment.map.owner)
  end
end
