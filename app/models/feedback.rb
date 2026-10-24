# What a person tells us with « Un retour ? » (in the editor's header and the
# app's): their words, the page they were on, the map if any, and whether
# they would welcome a call. Staff read them in « Premières heures »
# (/admin/first-hours); the browser also sends a copy to Sentry's User
# Feedback, next to the session's replay when one is recording.
class Feedback < ApplicationRecord
  MESSAGE_LIMIT = 4000

  belongs_to :user
  belongs_to :map, optional: true

  normalizes :message, with: ->(message) { message.strip }
  # A path of this site, as the browser sends it; anything else is dropped
  # (it becomes a link in the admin page and the e-mail).
  normalizes :path, with: ->(path) { path.match?(%r{\A/[^\s]*\z}) ? path.first(500) : nil }
  validates :message, presence: true, length: { maximum: MESSAGE_LIMIT }
  validates :sentry_replay_id, format: { with: SessionReplay::ID_FORMAT }, allow_nil: true

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  def as_admin_json
    { id:, message:, path:, wantsCall: wants_call, createdAt: created_at.iso8601,
      map: map && { id: map.id, name: map.name },
      replayUrl: sentry_replay_id && SessionReplay.url_for(sentry_replay_id) }
  end
end
