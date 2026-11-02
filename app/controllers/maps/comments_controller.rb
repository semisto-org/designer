module Maps
  # Discussions on a map: one thread per commentable object (the map, a
  # feature…). Every member of the map, viewers included, can read and
  # write an element's thread; the map's own thread is its live discussion,
  # for its members only (Map#chat_member?). Only the author edits; the
  # author or the owner deletes.
  class CommentsController < ApplicationController
    include MapScoped
    include CommentScoped

    before_action :set_map
    before_action :set_commentable, only: %i[index create read]
    before_action :set_comment, only: %i[show update destroy]

    # One thread: its comments, whether I follow it, who I can mention, who
    # my next comment will e-mail.
    # Opening a thread marks it as read (the previous read time is returned
    # so the client can show what is new).
    def index
      comments = @commentable.comments.visible.chronological.includes(:author, :map_photo, applauses: :user)
      last_read = CommentRead.find_by(user: Current.user, commentable: @commentable)&.last_read_at
      payload = {
        commentable: { type: @commentable.class.name, id: @commentable.id, key: @commentable.comment_key, title: @commentable.comment_title },
        comments: comments.map { |c| comment_serializer.call(c) },
        subscribed: CommentSubscription.subscribed?(Current.user, @commentable),
        lastReadAt: last_read&.iso8601,
        members: comment_serializer.mentionable(@commentable),
        notified: Collab::CommentNotifier.recipients_for(@commentable, Current.user)&.map(&:display_name),
        commentEmails: Current.user.comment_emails
      }
      CommentRead.mark!(Current.user, @commentable)
      render json: payload
    end

    # One message, as this person sees it (the live discussion reads each
    # message it is told about, MapChatChannel).
    def show
      render json: comment_serializer.call(@comment)
    end

    # The person has the thread open and saw the latest messages.
    def read
      CommentRead.mark!(Current.user, @commentable)
      head :no_content
    end

    # Every thread of the map with its latest comment and an unread flag.
    def threads
      render json: { threads: Collab::ThreadList.new(@map, Current.user).call, commentEmails: Current.user.comment_emails }
    end

    def create
      comment = @commentable.comments.new(body: comment_body, author: Current.user, **pointers)
      if comment.save
        render json: comment_serializer.call(comment), status: :created
      else
        render_errors comment
      end
    end

    def update
      return render json: { message: t("collab.comments.errors.author_only") }, status: :forbidden unless @comment.author_id == Current.user.id
      if @comment.update(body: comment_body, **pointers.slice(:feature_ids))
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
        require_chat_member_for(@comment)
      end

      def comment_body
        params.require(:comment).permit(:body)[:body]
      end

      # What a message points at on the map: cited elements, a pinned spot
      # (lng, lat), a photo of the map (one an editor uploaded).
      def pointers
        attrs = params.require(:comment).permit(:lng, :lat, :map_photo_id, feature_ids: [])
        pointers = {}
        pointers[:feature_ids] = Array(attrs[:feature_ids]).map(&:to_i) if attrs.key?(:feature_ids)
        pointers[:location] = [ attrs[:lng], attrs[:lat] ] if attrs[:lng].present? && attrs[:lat].present?
        pointers[:map_photo] = @map.photos.find_by(id: attrs[:map_photo_id]) if attrs[:map_photo_id].present?
        pointers
      end
  end
end
