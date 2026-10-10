# A person's thumbs up on a « Nouveautés » entry: at most one each.
class ReleaseNoteLike < ApplicationRecord
  belongs_to :release_note
  belongs_to :user
  validates :user_id, uniqueness: { scope: :release_note_id }
end
