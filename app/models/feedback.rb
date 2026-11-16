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
  # What became of it, as the person sees it in « Mes retours » (inspired by
  # UserVoice: the loop closes with a word to the author).
  STATUSES = %w[received reviewing planned done declined].freeze
  REPLY_LIMIT = 4000

  belongs_to :user
  belongs_to :map, optional: true
  belongs_to :handled_by, class_name: "User", optional: true
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
  validates :status, inclusion: { in: STATUSES }
  validates :reply, length: { maximum: REPLY_LIMIT }
  validate :screenshot_is_an_image

  before_create { self.app_version ||= ENV["SOURCE_COMMIT"].presence&.first(12) }

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }
  # Still waiting for Semisto: neither done nor declined.
  scope :awaiting, -> { where(status: %w[received reviewing planned]) }

  # Semisto answers: a new status and/or a few words. With `notify`, the
  # author gets them by e-mail (FeedbackMailer.answered) when something
  # they would care about changed. Returns false when it does not save.
  def answer!(status:, reply:, by:, notify: true)
    self.status = status if status.present?
    self.reply = reply.to_s.strip.presence
    return true unless changed?
    self.status_changed_at = Time.current if status_changed?
    self.handled_by = by
    worth_telling = notify && (reply_changed? && reply.present? || status_changed? && status != "reviewing")
    self.author_notified_at = Time.current if worth_telling
    return false unless save
    FeedbackMailer.answered(self).deliver_later if worth_telling
    true
  end

  # What the author reads in « Mes retours ».
  def as_owner_json
    { id:, message:, path:, createdAt: created_at.iso8601, status:, reply:,
      statusChangedAt: status_changed_at&.iso8601,
      map: map && { id: map.id, name: map.name },
      screenshotUrl: screenshot_path }
  end

  def as_admin_json
    { id:, message:, path:, wantsCall: wants_call, createdAt: created_at.iso8601,
      map: map && { id: map.id, name: map.name },
      replayUrl: sentry_replay_id && SessionReplay.url_for(sentry_replay_id),
      screenshotUrl: screenshot_path,
      context: context.presence, appVersion: app_version,
      status:, reply:, statusChangedAt: status_changed_at&.iso8601, authorNotifiedAt: author_notified_at&.iso8601,
      handledBy: handled_by&.display_name }
  end

  def screenshot_path
    Rails.application.routes.url_helpers.rails_blob_path(screenshot, only_path: true) if screenshot.attached?
  end

  private
    def screenshot_is_an_image
      return unless screenshot.attached?
      blob = screenshot.blob
      errors.add(:base, I18n.t("feedback.screenshot.invalid")) unless SCREENSHOT_TYPES.include?(blob.content_type)
      errors.add(:base, I18n.t("feedback.screenshot.too_large")) if blob.byte_size > SCREENSHOT_MAX_BYTES
    end
end
