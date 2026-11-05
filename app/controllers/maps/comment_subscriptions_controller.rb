module Maps
  # Follow or unfollow a thread (follow = e-mails on new comments). For the
  # map's own discussion: receive its digest, or mute it, or choose its level
  # (every message, mentions only, nothing).
  class CommentSubscriptionsController < ApplicationController
    include MapScoped
    include CommentScoped

    before_action :set_map
    before_action :set_commentable

    def create
      return render(json: { subscribed: !CommentSubscription.mute(Current.user, @commentable, false).muted }, status: :created) if @commentable.is_a?(Map)
      CommentSubscription.subscribe(Current.user, @commentable)
      render json: { subscribed: true }, status: :created
    end

    # The map's discussion only: how much of it reaches me, wherever it
    # reaches me (CommentSubscription::CHAT_LEVELS).
    def update
      return head(:unprocessable_entity) unless @commentable.is_a?(Map)
      level = params.require(:level).to_s
      return render(json: { message: t("collab.chat.notify.invalid") }, status: :unprocessable_entity) unless CommentSubscription::CHAT_LEVELS.include?(level)
      subscription = CommentSubscription.set_chat_level(Current.user, @commentable, level)
      render json: { level:, subscribed: !subscription.muted }
    end

    def destroy
      return render(json: { subscribed: false }) if @commentable.is_a?(Map) && CommentSubscription.mute(Current.user, @commentable, true)
      CommentSubscription.unsubscribe(Current.user, @commentable)
      render json: { subscribed: false }
    end
  end
end
