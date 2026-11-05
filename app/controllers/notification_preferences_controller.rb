# « Mon compte » › Notifications: where a discussion message reaches me, for
# all my maps (the bell, e-mail, the phone). Each map can then say how much
# (every message, mentions, nothing: Maps::CommentSubscriptionsController).
class NotificationPreferencesController < ApplicationController
  forbid_while_impersonating only: :update

  FIELDS = { app: :chat_notify_app, email: :comment_emails, push: :chat_notify_push }.freeze

  def show
    render json: self.class.preferences(Current.user)
  end

  def update
    changes = FIELDS.filter_map do |param, column|
      [ column, ActiveModel::Type::Boolean.new.cast(params[param]) == true ] if params.key?(param)
    end.to_h
    Current.user.update!(changes) if changes.any?
    render json: self.class.preferences(Current.user)
  end

  def self.preferences(user)
    { app: user.chat_notify_app, email: user.comment_emails, push: user.chat_notify_push, phones: user.push_devices.count }
  end
end
