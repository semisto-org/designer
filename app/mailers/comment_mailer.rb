# Discussion e-mails. Both link back to the thread on the map.
class CommentMailer < ApplicationMailer
  helper CommentsHelper

  def mentioned(comment, user)
    prepare(comment, user)
    return if comment.deleted?
    mail to: user.email_address, subject: t(".subject", author: @author.display_name, title: @title)
  end

  def new_comment(comment, user)
    prepare(comment, user)
    return if comment.deleted?
    mail to: user.email_address, subject: t(".subject", author: @author.display_name, title: @title)
  end

  private
    def prepare(comment, user)
      @comment = comment
      @user = user
      @author = comment.author
      @map = comment.map
      @title = comment.commentable.comment_title
      @thread_title = comment.commentable.is_a?(Map) ? @map.name : t("comment_mailer.on_element", title: @title, map: @map.name)
      @url = map_url(@map, discussion: comment.commentable.comment_key, anchor: "comment-#{comment.id}")
    end
end
