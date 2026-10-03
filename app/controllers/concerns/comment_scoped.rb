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
      head :not_found unless @commentable
    end

    def comment_serializer
      @comment_serializer ||= Collab::CommentSerializer.new(@map, Current.user)
    end
end
