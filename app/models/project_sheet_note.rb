# An internal note at the bottom of one section of a map's project sheet
# (Markdown, written in a rich text editor). It is for the professionals who
# design the place, never for the people behind the project:
#
# - on a team map, every member of the team reads and writes it;
# - on a map outside any team, its owner when they have a pro account.
#
# Nobody else ever reads it: not the editors or viewers invited on the map
# (the client, the household, a neighbour), not the private link of the
# sheet, not the public map, the dossier or the offline export. Those all
# read `maps.project`; the notes live apart so none of them can carry them.
#
# Writing needs a professional plan on the map (Pro or Team, the same gate as
# the offer builder). When the plan ends, notes stay readable, never deleted.
class ProjectSheetNote < ApplicationRecord
  MAX_LENGTH = 20_000

  belongs_to :map
  belongs_to :updated_by, class_name: "User", optional: true

  validates :section, inclusion: { in: ProjectSheet::SECTIONS.keys }, uniqueness: { scope: :map_id }
  validates :body, presence: true, length: { maximum: MAX_LENGTH }

  # Who the notes are for: the map's team, else its owner with a pro account.
  def self.audience?(map, user)
    return false unless user
    return map.organization.member?(user) if map.organization
    map.owner_id == user.id && user.professional?
  end

  # Writing: the audience, on a map that can be edited, with a pro plan.
  def self.writable?(map, user)
    audience?(map, user) && map.editable_by?(user) && !map.archived? && !map.read_only_by_plan? &&
      Entitlements.for_map(map).offers?
  end

  # For the sheet's page and panel: nil for anyone outside the audience, so
  # the notes are not even announced to them.
  def self.props_for(map, user)
    return nil unless audience?(map, user)
    notes = map.project_sheet_notes.includes(:updated_by).to_h { [ _1.section, _1.as_json ] }
    { canEdit: writable?(map, user), teamName: map.organization&.name, notes: }
  end

  # Saves the section's note (an empty text removes it). `lock_version` is
  # the version the writer started from, nil when they saw no note: a note
  # written meanwhile by someone else raises StaleObjectError, so nobody's
  # text is silently replaced.
  def self.write!(map, section, body, user:, lock_version:)
    note = ProjectSheetNote.find_or_initialize_by(map:, section:)
    expected = lock_version.presence&.to_i
    raise ActiveRecord::StaleObjectError.new(note, "update") if note.persisted? ? expected != note.lock_version : !expected.nil?
    body = body.to_s.strip
    if body.empty?
      note.destroy! if note.persisted?
      return nil
    end
    note.update!(body:, updated_by: user)
    note
  end

  def as_json(*)
    { body:, lockVersion: lock_version, updatedAt: updated_at&.iso8601, updatedBy: updated_by&.display_name }
  end
end
