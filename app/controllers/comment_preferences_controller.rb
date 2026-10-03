# Per-user switch for discussion e-mails (the thread subscriptions stay).
class CommentPreferencesController < ApplicationController
  def update
    enabled = ActiveModel::Type::Boolean.new.cast(params.require(:comment_emails))
    Current.user.update!(comment_emails: enabled == true)
    render json: { commentEmails: Current.user.comment_emails }
  end
end
