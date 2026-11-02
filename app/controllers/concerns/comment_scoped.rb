# Finds the thread (the map or one of its commentable objects) a comments
# request is about. Anything outside the map is a 404.
module CommentScoped
  extend ActiveSupport::Concern

  private
    def set_commentable
      source = params[:comment].is_a?(ActionController::Parameters) ? params[:comment] : params
      type = source[:commentable_type].presence || "Map"
      id = source[:commentable_id].presence || (@map.id if type == "Map")
      @commentable = Commentable.find_in_map(@map, type, id)
      return head :not_found unless @commentable
      refuse_chat if @commentable.is_a?(Map) && !@map.chat_member?(Current.user)
    end

    # The map's own discussion is for its members only (Map#chat_member?).
    def require_chat_member_for(comment)
      refuse_chat if comment.chat? && !@map.chat_member?(Current.user)
    end

    def refuse_chat
      render json: { message: t("collab.chat.errors.not_member"), code: "chat_closed" }, status: :forbidden
    end

    def comment_serializer
      @comment_serializer ||= Collab::CommentSerializer.new(@map, Current.user)
    end
end
