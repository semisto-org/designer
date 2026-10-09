module ReleaseNotes
  # Thumbs up on a « Nouveautés » entry (one per person) or take it back.
  # Answers with the entry's likers, for the page to redraw the avatars.
  class LikesController < ApplicationController
    before_action :set_note

    def create
      @note.likes.find_or_create_by!(user: Current.user)
      render_likes(:created)
    rescue ActiveRecord::RecordNotUnique
      render_likes(:ok)
    end

    def destroy
      @note.likes.where(user: Current.user).delete_all
      render_likes
    end

    private
      def set_note
        @note = ReleaseNote.published.find(params[:release_note_id])
      end

      def render_likes(status = :ok)
        likers = @note.likes.includes(:user).order(:created_at, :id).limit(ReleaseNotesController::LIKERS_LIMIT).map(&:user)
        render json: {
          likes: likers.map { |user| ReleaseNote.liker_json(user) },
          likesCount: @note.likes.count,
          liked: @note.likes.exists?(user: Current.user)
        }, status:
      end
  end
end
