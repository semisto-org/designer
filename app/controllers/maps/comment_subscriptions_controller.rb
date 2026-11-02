module Maps
  # Follow or unfollow a thread (follow = e-mails on new comments). For the
  # map's own discussion: receive its digest, or mute it.
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

    def destroy
      return render(json: { subscribed: false }) if @commentable.is_a?(Map) && CommentSubscription.mute(Current.user, @commentable, true)
      CommentSubscription.unsubscribe(Current.user, @commentable)
      render json: { subscribed: false }
    end
  end
end
