# Semisto staff: write the « Nouveautés » entries (title, text, day, an
# optional screenshot and link), keep them as drafts or publish them, and see
# how many thumbs up each one got. Admins only (anyone else gets a 404).
module Admin
  class ReleaseNotesController < BaseController
    before_action :set_note, only: %i[edit update destroy]

    def index
      render inertia: "admin/release_notes/index", props: {
        notes: ReleaseNote.newest_first.with_attached_screenshot.includes(:likes).map(&:as_admin_json)
      }
    end

    def new
      render inertia: "admin/release_notes/form", props: { note: nil }
    end

    def edit
      render inertia: "admin/release_notes/form", props: { note: @note.as_admin_json }
    end

    def create
      note = ReleaseNote.new(note_params.merge(created_by: Current.user))
      apply_publication(note)
      if note.save
        redirect_to admin_release_notes_path, notice: t("release_notes.admin.flash.created", title: note.title), status: :see_other
      else
        redirect_to new_admin_release_note_path, inertia: { errors: note.errors }, status: :see_other
      end
    end

    def update
      @note.assign_attributes(note_params)
      apply_publication(@note)
      remove_screenshot = params.dig(:release_note, :remove_screenshot) == "1" && note_params[:screenshot].blank?
      if @note.save
        @note.screenshot.purge_later if remove_screenshot
        redirect_to admin_release_notes_path, notice: t("release_notes.admin.flash.updated", title: @note.title), status: :see_other
      else
        redirect_to edit_admin_release_note_path(@note), inertia: { errors: @note.errors }, status: :see_other
      end
    end

    def destroy
      @note.destroy!
      redirect_to admin_release_notes_path, notice: t("release_notes.admin.flash.destroyed", title: @note.title), status: :see_other
    end

    private
      def set_note
        @note = ReleaseNote.find(params[:id])
      end

      def note_params
        params.require(:release_note).permit(:title, :body, :published_on, :link_path, :link_label, :screenshot_alt, :screenshot)
      end

      # « Publier » makes it visible now (once: editing a published entry
      # keeps its moment, so it does not come back as new); unticking it
      # takes it back to draft.
      def apply_publication(note)
        publish = params.dig(:release_note, :published)
        return if publish.nil?
        if ActiveModel::Type::Boolean.new.cast(publish)
          note.published_at ||= Time.current
        else
          note.published_at = nil
        end
      end
  end
end
