module Maps
  # Discussions on a map: one thread per commentable object (the map, a
  # feature…). Every member of the map, viewers included, can read and
  # write; only the author edits; the author or the owner deletes.
  class CommentsController < ApplicationController
    include MapScoped
    include CommentScoped

    before_action :set_map
    before_action :set_commentable, only: %i[index create]
    before_action :set_comment, only: %i[update destroy]

    # One thread: its comments, whether I follow it, who I can mention.
    # Opening a thread marks it as read (the previous read time is returned
    # so the client can show what is new).
    def index
      comments = @commentable.comments.visible.chronological.includes(:author, applauses: :user)
      last_read = CommentRead.find_by(user: Current.user, commentable: @commentable)&.last_read_at
      payload = {
        commentable: { type: @commentable.class.name, id: @commentable.id, key: @commentable.comment_key, title: @commentable.comment_title },
        comments: comments.map { |c| comment_serializer.call(c) },
        subscribed: CommentSubscription.subscribed?(Current.user, @commentable),
        lastReadAt: last_read&.iso8601,
        members: comment_serializer.mentionable,
        commentEmails: Current.user.comment_emails
      }
      CommentRead.mark!(Current.user, @commentable)
      render json: payload
    end

    # Every thread of the map with its latest comment and an unread flag.
    def threads
      render json: { threads: Collab::ThreadList.new(@map, Current.user).call, commentEmails: Current.user.comment_emails }
    end

    def create
      comment = @commentable.comments.new(body: comment_body, author: Current.user)
      if comment.save
        render json: comment_serializer.call(comment), status: :created
      else
        render_errors comment
      end
    end

    def update
      return render json: { message: t("collab.comments.errors.author_only") }, status: :forbidden unless @comment.author_id == Current.user.id
      if @comment.update(body: comment_body)
        render json: comment_serializer.call(@comment)
      else
        render_errors @comment
      end
    end

    def destroy
      unless @comment.author_id == Current.user.id || @role == "owner"
        return render json: { message: t("collab.comments.errors.cannot_delete") }, status: :forbidden
      end
      @comment.soft_delete!
      head :no_content
    end

    private
      def set_comment
        @comment = @map.discussion_comments.visible.find(params[:id])
      end

      def comment_body
        params.require(:comment).permit(:body)[:body]
      end
  end
end
