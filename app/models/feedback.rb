# What a person tells us with « Un retour ? » (in the editor's header and the
# app's): their words, the page they were on, the map if any, whether they
# would welcome a call and, if they took one, a screenshot they cropped and
# drew on to show what they mean. The browser adds a little context (window,
# screen, language) and the server the deployed commit. Staff read them in
# « Premières heures » (/admin/first-hours) and through the MCP tool
# list_feedback; the browser also sends a copy to Sentry's User Feedback,
# next to the session's replay when one is recording.
class Feedback < ApplicationRecord
  MESSAGE_LIMIT = 4000
  SCREENSHOT_TYPES = %w[image/jpeg image/png image/webp].freeze
  SCREENSHOT_MAX_BYTES = 8.megabytes
  # The browser's description of itself: only these keys, short strings.
  CONTEXT_KEYS = %w[user_agent viewport screen pixel_ratio language timezone platform].freeze

  belongs_to :user
  belongs_to :map, optional: true
  # Semisto keeps it, not the person: it never counts against their storage.
  has_one_attached :screenshot

  normalizes :message, with: ->(message) { message.strip }
  # A path of this site, as the browser sends it; anything else is dropped
  # (it becomes a link in the admin page and the e-mail).
  normalizes :path, with: ->(path) { path.match?(%r{\A/[^\s]*\z}) ? path.first(500) : nil }
  normalizes :context, with: ->(context) {
    context.to_h.stringify_keys.slice(*CONTEXT_KEYS).transform_values { |value| value.to_s.first(300) }.compact_blank
  }
  validates :message, presence: true, length: { maximum: MESSAGE_LIMIT }
  validates :sentry_replay_id, format: { with: SessionReplay::ID_FORMAT }, allow_nil: true
  validate :screenshot_is_an_image

  before_create { self.app_version ||= ENV["SOURCE_COMMIT"].presence&.first(12) }

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  def as_admin_json
    { id:, message:, path:, wantsCall: wants_call, createdAt: created_at.iso8601,
      map: map && { id: map.id, name: map.name },
      replayUrl: sentry_replay_id && SessionReplay.url_for(sentry_replay_id),
      screenshotUrl: screenshot.attached? ? Rails.application.routes.url_helpers.rails_blob_path(screenshot, only_path: true) : nil,
      context: context.presence, appVersion: app_version }
  end

  private
    def screenshot_is_an_image
      return unless screenshot.attached?
      blob = screenshot.blob
      errors.add(:base, I18n.t("feedback.screenshot.invalid")) unless SCREENSHOT_TYPES.include?(blob.content_type)
      errors.add(:base, I18n.t("feedback.screenshot.too_large")) if blob.byte_size > SCREENSHOT_MAX_BYTES
    end
end
