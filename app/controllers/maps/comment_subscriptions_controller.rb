module Maps
  # Follow or unfollow a thread (follow = e-mails on new comments).
  class CommentSubscriptionsController < ApplicationController
    include MapScoped
    include CommentScoped

    before_action :set_map
    before_action :set_commentable

    def create
      CommentSubscription.subscribe(Current.user, @commentable)
      render json: { subscribed: true }, status: :created
    end

    def destroy
      CommentSubscription.unsubscribe(Current.user, @commentable)
      render json: { subscribed: false }
    end
  end
end
