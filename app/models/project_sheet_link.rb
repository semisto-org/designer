# The private link to a map's project sheet, for the people behind the
# project: it opens the sheet's form only (no map, no other data), without an
# account. Editors of the map create it, switch it off or reset it (a new
# address, copies of the old one stop working).
class ProjectSheetLink < ApplicationRecord
  belongs_to :map
  belongs_to :created_by, class_name: "User", optional: true

  has_secure_token :token, length: 32

  def enabled? = disabled_at.nil?

  # Usable right now: switched on and the map still lives.
  def live? = enabled? && map.archived_at.nil?

  def enable! = update!(disabled_at: nil)
  def disable! = update!(disabled_at: Time.current)

  def reset!
    regenerate_token
    update!(disabled_at: nil, opened_at: nil, submitted_at: nil)
  end

  def opened! = update_column(:opened_at, Time.current)

  # The person says they are done: notify the people working on the map
  # (the owner and whoever created the link), once per submission.
  def submit!
    update!(submitted_at: Time.current)
    recipients.each { |user| ProjectSheetLinkMailer.submitted(self, user).deliver_later }
  end

  def recipients = [ map.owner, created_by ].compact.uniq.select { |user| map.editable_by?(user) }

  def as_json_for_editor(url)
    {
      url:,
      enabled: enabled?,
      openedAt: opened_at&.iso8601,
      submittedAt: submitted_at&.iso8601,
      createdAt: created_at&.iso8601
    }
  end
end
