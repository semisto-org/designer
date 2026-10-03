module Maps
  module Comments
    # Applaud a comment (one per person) or take it back.
    class ApplausesController < ApplicationController
      include MapScoped
      include CommentScoped

      before_action :set_map
      before_action :set_comment

      def create
        @comment.applauses.find_or_create_by!(user: Current.user)
        render_comment(:created)
      rescue ActiveRecord::RecordNotUnique
        render_comment(:ok)
      end

      def destroy
        @comment.applauses.where(user: Current.user).destroy_all
        render_comment
      end

      private
        def set_comment
          @comment = @map.discussion_comments.visible.find(params[:comment_id])
        end

        def render_comment(status = :ok)
          render json: comment_serializer.call(@comment.reload), status:
        end
    end
  end
end
