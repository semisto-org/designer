# « Nouveautés »: what changed in the Designer, newest first, for everyone
# signed in. Opening the page marks every entry as seen (the dot in the
# main menu goes away); the entries published since the previous visit keep
# their « nouveau » mark for this visit. Screenshots leave through a
# short-lived link, like map photos.
class ReleaseNotesController < ApplicationController
  include ActiveStorage::SetCurrent

  LINK_LIFETIME = 10.minutes
  # Likers shown per entry: everyone, up to a bound that keeps the page light.
  LIKERS_LIMIT = 300

  def index
    seen_since = Current.user.release_notes_seen_at || Current.user.created_at
    notes = ReleaseNote.published.newest_first.with_attached_screenshot.to_a
    likers = likers_by_note(notes)
    counts = ReleaseNoteLike.where(release_note_id: notes.map(&:id)).group(:release_note_id).count
    mine = Current.user.release_note_likes.where(release_note_id: notes.map(&:id)).pluck(:release_note_id).to_set
    Current.user.update_column(:release_notes_seen_at, Time.current)
    render inertia: "release_notes/index", props: {
      notes: notes.map do |note|
        note.as_inertia(likers: likers.fetch(note.id, []), liked: mine.include?(note.id), likes_count: counts.fetch(note.id, 0), seen_since:)
      end
    }
  end

  def screenshot
    # Staff also see the screenshot of a draft, in /admin/release-notes.
    note = (Current.user.admin? ? ReleaseNote.all : ReleaseNote.published).find(params[:id])
    attachment = note.screenshot
    return head :not_found unless attachment.attached?
    target = begin
      attachment.variant(:display).processed
    rescue StandardError => error
      Rails.logger.warn("[release_notes] no display variant for note #{note.id}: #{error.class}: #{error.message}")
      attachment
    end
    expires_in LINK_LIFETIME - 1.minute, private: true
    redirect_to target.url(expires_in: LINK_LIFETIME, disposition: :inline), allow_other_host: true
  end

  private
    def likers_by_note(notes)
      ReleaseNoteLike.where(release_note_id: notes.map(&:id)).includes(:user).order(:created_at, :id)
        .group_by(&:release_note_id).transform_values { |likes| likes.first(LIKERS_LIMIT).map(&:user) }
    end
end
